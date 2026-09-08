// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
//
// Preview pipeline: validate the compile result, hand the compiled module
// graph (`preview-graph.ts`) to a renderer, and wrap the rendered HTML into a
// sandboxed document.
//
// Three renderers implement the same contract:
//   - SandboxPreviewRenderer: BrowserPreviewRenderer inside a hidden iframe on a
//                             separate origin (default when that origin exists)
//   - BrowserPreviewRenderer: astro/container inside a Web Worker of this origin
//   - ServerPreviewRenderer:  POST /api/render → Worker Loader dynamic Worker
// browser vs server is chosen at build time via PUBLIC_PREVIEW_RENDERER; the
// sandbox origin via PUBLIC_PREVIEW_ORIGIN (see config.ts).
import type { CompileResult } from "@astrojs/compiler-binding";
import type { ParsedAst } from "./compiler-protocol";
import { PREVIEW_ORIGIN, PREVIEW_RENDERER, PREVIEW_TIMEOUT_MS } from "./config";
import { type AssetUrls, rewriteDocumentAssets } from "./preview-assets";
import type { ImportCheck } from "./preview-graph";
import type {
	PreviewRendererMode,
	PreviewRenderRequest,
	PreviewRenderResponse,
	PreviewWorkerRequest,
	PreviewWorkerResponse,
} from "./preview-protocol";
import {
	FRAME_MESSAGE,
	type FrameToParentMessage,
	isFrameMessage,
	type ParentToFrameMessage,
	previewFrameOrigins,
	previewFrameUrl,
} from "./preview-sandbox-protocol";

export type { PreviewRendererMode };

interface ActiveRender {
	controller: AbortController;
	timer: ReturnType<typeof setTimeout>;
}

interface AstNode {
	type?: unknown;
	source?: {
		value?: unknown;
	};
}

/**
 * Rejects module syntax the preview cannot follow. Without `checkImport`
 * every static import is rejected (a self-contained component); with it, each
 * import specifier is checked and the first message returned wins.
 */
function moduleSyntaxError(
	ast: unknown,
	checkImport?: ImportCheck,
): string | null {
	const stack: unknown[] = [ast];
	const seen = new WeakSet<object>();

	while (stack.length > 0) {
		const value = stack.pop();
		if (!value || typeof value !== "object" || seen.has(value)) continue;
		seen.add(value);

		const node = value as AstNode;
		if (node.type === "ImportDeclaration") {
			const specifier = node.source?.value;
			if (checkImport && typeof specifier === "string") {
				const problem = checkImport(specifier);
				if (problem) return problem;
			} else {
				return typeof specifier === "string"
					? `Imports are not supported in Preview: ${specifier}`
					: "Imports are not supported in Preview.";
			}
		}
		if (node.type === "ImportExpression") {
			return "Dynamic imports are not supported in Preview.";
		}
		if (
			(node.type === "ExportAllDeclaration" ||
				node.type === "ExportNamedDeclaration") &&
			node.source
		) {
			return "Re-exports are not supported in Preview.";
		}

		// Push in reverse so the stack visits nodes in source order (the first
		// offending import is the one reported).
		for (const child of Object.values(value).reverse()) {
			if (child && typeof child === "object") stack.push(child);
		}
	}

	return null;
}

/**
 * Why a compiled file cannot be previewed, or null. `checkImport` (Page /
 * Site modes, see `preview-graph.ts`) decides which imports are allowed;
 * without it the file must be self-contained (Component mode).
 */
export function validatePreview(
	result: CompileResult,
	ast: ParsedAst,
	checkImport?: ImportCheck,
): string | null {
	if (
		result.diagnostics.some((diagnostic) => diagnostic.severity === "error")
	) {
		return "Fix compiler errors before rendering the preview.";
	}

	const syntaxError = moduleSyntaxError(ast.ast, checkImport);
	if (syntaxError) return syntaxError;

	if (
		result.hydratedComponents.length > 0 ||
		result.clientOnlyComponents.length > 0
	) {
		return "Framework components and client directives are not supported in Preview.";
	}
	if (result.serverComponents.length > 0) {
		return "Server islands are not supported in Preview.";
	}
	if (result.scripts.some((script) => script.type === "external")) {
		return "External scripts are not supported in Preview.";
	}

	return null;
}

/**
 * CSP of the display iframe (`srcdoc`, `sandbox="allow-scripts"`). Images may
 * come from `https:` (Phase 5: external images in pages), from the project's
 * `public/` files inlined as `data:` URLs, or from `blob:`; scripts and styles
 * are inline only and nothing may connect to the network.
 */
export const PREVIEW_DOCUMENT_CSP = [
	"default-src 'none'",
	"base-uri 'none'",
	"script-src 'unsafe-inline'",
	"style-src 'unsafe-inline'",
	"img-src https: data: blob:",
	"media-src data: blob:",
	"font-src data:",
	"connect-src 'none'",
	"form-action 'none'",
].join("; ");

/**
 * Wrap rendered HTML into the sandboxed preview document. `assets` maps the
 * project's `public/` files (`/images/logo.png`) to `data:` URLs so the
 * markup and CSS can reference them like a real Astro site does.
 */
export function createPreviewDocument(
	html: string,
	css: string[],
	assets: AssetUrls = {},
): string {
	const document = new DOMParser().parseFromString(html, "text/html");
	const csp = document.createElement("meta");
	csp.httpEquiv = "Content-Security-Policy";
	csp.content = PREVIEW_DOCUMENT_CSP;

	const viewport = document.createElement("meta");
	viewport.name = "viewport";
	viewport.content = "width=device-width, initial-scale=1";

	const style = document.createElement("style");
	style.textContent = css.join("\n\n");
	document.head.prepend(csp, viewport, style);
	rewriteDocumentAssets(document, assets);

	return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export interface PreviewRenderer {
	readonly mode: PreviewRendererMode;
	/** True when generated code runs on another origin (sandbox frame) or on the server. */
	readonly isolated: boolean;
	/** Render the prepared request. Must reject with `signal.reason` when aborted. */
	render(request: PreviewRenderRequest, signal: AbortSignal): Promise<string>;
	dispose(): void;
}

export interface ServerPreviewRendererOptions {
	endpoint?: string;
	fetch?: typeof globalThis.fetch;
}

/** Renders via `POST /api/render` (Cloudflare Worker Loader). */
export class ServerPreviewRenderer implements PreviewRenderer {
	readonly mode = "server" as const;
	readonly isolated = true;
	#endpoint: string;
	#fetch: typeof globalThis.fetch;

	constructor(options: ServerPreviewRendererOptions = {}) {
		this.#endpoint = options.endpoint ?? "/api/render";
		this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	}

	async render(
		request: PreviewRenderRequest,
		signal: AbortSignal,
	): Promise<string> {
		const response = await this.#fetch(this.#endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request),
			signal,
		});
		const payload = (await response.json()) as PreviewRenderResponse;
		if (!payload || typeof payload !== "object" || !("ok" in payload)) {
			throw new Error("The preview server returned an invalid response.");
		}
		if (!response.ok || !payload.ok) {
			throw new Error(
				"error" in payload
					? payload.error
					: "The preview server returned an error.",
			);
		}
		return payload.html;
	}

	dispose(): void {}
}

interface PendingRender {
	resolve: (html: string) => void;
	reject: (reason: unknown) => void;
}

/**
 * Renders inside a dedicated Web Worker running `astro/container`.
 *
 * Generated code cannot be interrupted once it is executing, so an abort (user
 * edit, timeout on an infinite loop) terminates the Worker; the next render
 * spawns a fresh one — the same recovery strategy as `CompilerClient`.
 */
export class BrowserPreviewRenderer implements PreviewRenderer {
	readonly mode = "browser" as const;
	/** Generated code runs with this origin's privileges; use the sandbox when possible. */
	readonly isolated = false;
	#worker: Worker | null = null;
	#seq = 0;
	#pending = new Map<number, PendingRender>();

	#spawn(): Worker {
		const worker = new Worker(
			new URL("./preview-browser.worker.ts", import.meta.url),
			{ type: "module", name: "astro-preview" },
		);
		worker.onmessage = (event: MessageEvent<PreviewWorkerResponse>) => {
			const pending = this.#pending.get(event.data.id);
			if (!pending) return;
			this.#pending.delete(event.data.id);
			if (event.data.ok) pending.resolve(event.data.html);
			else pending.reject(new Error(event.data.error));
		};
		worker.onerror = (event) =>
			this.#crash(new Error(event.message || "The preview worker crashed."));
		worker.onmessageerror = () =>
			this.#crash(new Error("The preview worker sent an invalid message."));
		this.#worker = worker;
		return worker;
	}

	#crash(reason: unknown) {
		this.#worker?.terminate();
		this.#worker = null;
		for (const pending of this.#pending.values()) pending.reject(reason);
		this.#pending.clear();
	}

	render(request: PreviewRenderRequest, signal: AbortSignal): Promise<string> {
		if (signal.aborted) return Promise.reject(signal.reason);
		const worker = this.#worker ?? this.#spawn();
		const id = ++this.#seq;
		return new Promise<string>((resolve, reject) => {
			const onAbort = () => {
				if (this.#pending.has(id)) this.#crash(signal.reason);
			};
			signal.addEventListener("abort", onAbort, { once: true });
			this.#pending.set(id, {
				resolve: (html) => {
					signal.removeEventListener("abort", onAbort);
					resolve(html);
				},
				reject: (reason) => {
					signal.removeEventListener("abort", onAbort);
					reject(reason);
				},
			});
			const message: PreviewWorkerRequest = { id, ...request };
			worker.postMessage(message);
		});
	}

	dispose(): void {
		this.#crash(new Error("Preview renderer disposed."));
	}
}

// --- sandbox frame -----------------------------------------------------------

export interface SandboxChannel {
	post(message: ParentToFrameMessage): void;
	dispose(): void;
}

export interface SandboxChannelHandlers {
	onMessage(message: FrameToParentMessage): void;
	/** The frame document finished loading (also fires for error pages). */
	onLoad?(): void;
}

/** Opens a connection to the frame; the default one creates a hidden iframe. */
export type SandboxChannelFactory = (
	handlers: SandboxChannelHandlers,
) => SandboxChannel;

export function iframeChannel(
	frameUrl: string,
	doc: Document = document,
	win: Window = window,
): SandboxChannelFactory {
	const origin = new URL(frameUrl).origin;
	return ({ onMessage, onLoad }) => {
		const frame = doc.createElement("iframe");
		// A different origin plus these flags: scripts run, but with the frame's
		// own (empty) storage, no forms, popups, or top-level navigation.
		frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
		frame.setAttribute("aria-hidden", "true");
		frame.tabIndex = -1;
		frame.title = "Preview sandbox";
		frame.style.display = "none";
		frame.src = frameUrl;
		const listener = (event: MessageEvent) => {
			if (event.origin !== origin || event.source !== frame.contentWindow)
				return;
			if (isFrameMessage(event.data)) onMessage(event.data);
		};
		win.addEventListener("message", listener);
		if (onLoad) frame.addEventListener("load", () => onLoad(), { once: true });
		doc.body.append(frame);
		return {
			post: (message) => frame.contentWindow?.postMessage(message, origin),
			dispose: () => {
				win.removeEventListener("message", listener);
				frame.remove();
			},
		};
	};
}

/** How long a frame may take to say "ready" before the next candidate is tried. */
export const SANDBOX_READY_TIMEOUT_MS = 10_000;
/**
 * After the frame's `load` event, how long to still wait for "ready". A real
 * frame posts it before `load` (module scripts run first); an error page
 * (connection refused, 404) fires `load` and never posts, so this stays short.
 */
export const SANDBOX_LOAD_GRACE_MS = 500;

/** Thrown when no sandbox origin could be reached; callers may fall back. */
export class SandboxUnavailableError extends Error {
	override readonly name = "SandboxUnavailableError";
}

export interface SandboxRendererOptions {
	/** Opens a channel to the frame at `frameUrl` (default: hidden iframe). */
	connect?: (frameUrl: string) => SandboxChannelFactory;
	readyTimeoutMs?: number;
	loadGraceMs?: number;
}

/**
 * Renders through the preview sandbox frame on another origin. The frame runs
 * a `BrowserPreviewRenderer`; this side only forwards requests and aborts.
 * Candidates are tried in order the first time; when the frame later fails
 * (disappears, stops answering), pending renders are rejected and the next
 * render reconnects.
 */
export class SandboxPreviewRenderer implements PreviewRenderer {
	readonly mode = "browser" as const;
	readonly isolated = true;
	#candidates: string[];
	#connect: (frameUrl: string) => SandboxChannelFactory;
	#readyTimeoutMs: number;
	#loadGraceMs: number;
	#channel: SandboxChannel | null = null;
	#ready: Promise<void> | null = null;
	#seq = 0;
	#pending = new Map<number, PendingRender>();

	constructor(candidates: string[], options: SandboxRendererOptions = {}) {
		this.#candidates = candidates;
		this.#connect = options.connect ?? ((frameUrl) => iframeChannel(frameUrl));
		this.#readyTimeoutMs = options.readyTimeoutMs ?? SANDBOX_READY_TIMEOUT_MS;
		this.#loadGraceMs = options.loadGraceMs ?? SANDBOX_LOAD_GRACE_MS;
	}

	/** Load one candidate; resolves once the frame says ready. */
	#load(frameUrl: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			let grace: ReturnType<typeof setTimeout> | undefined;
			const fail = (reason: string) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				clearTimeout(grace);
				channel.dispose();
				reject(new Error(`The preview sandbox at ${frameUrl} ${reason}.`));
			};
			const timer = setTimeout(
				() => fail("did not load"),
				this.#readyTimeoutMs,
			);
			const channel = this.#connect(frameUrl)({
				onLoad: () => {
					if (!settled)
						grace = setTimeout(
							() => fail("loaded but did not answer (wrong page?)"),
							this.#loadGraceMs,
						);
				},
				onMessage: (message) => {
					if (message.type === FRAME_MESSAGE.ready) {
						if (settled) return;
						settled = true;
						clearTimeout(timer);
						clearTimeout(grace);
						this.#channel = channel;
						resolve();
						return;
					}
					const pending = this.#pending.get(message.id);
					if (!pending) return;
					this.#pending.delete(message.id);
					if (message.ok) pending.resolve(message.html);
					else pending.reject(new Error(message.error));
				},
			});
		});
	}

	async #openAny(): Promise<void> {
		const failures: string[] = [];
		for (const frameUrl of this.#candidates) {
			try {
				await this.#load(frameUrl);
				return;
			} catch (error) {
				failures.push(error instanceof Error ? error.message : String(error));
			}
		}
		throw new SandboxUnavailableError(
			`No preview sandbox origin is available (${failures.join("; ") || "no candidates"}). Set PUBLIC_PREVIEW_ORIGIN and serve /preview/ with the headers from public/_headers (see docs/PREVIEW_RENDERING.md).`,
		);
	}

	#open(): Promise<void> {
		if (this.#ready) return this.#ready;
		const ready = this.#openAny();
		this.#ready = ready;
		// A failed connection is reported through render(); reset so the next
		// render probes again (the server may have come up meanwhile).
		ready.catch((error) => {
			if (this.#ready === ready) this.#crash(error);
		});
		return ready;
	}

	#crash(reason: unknown) {
		this.#channel?.dispose();
		this.#channel = null;
		this.#ready = null;
		for (const pending of this.#pending.values()) pending.reject(reason);
		this.#pending.clear();
	}

	async render(
		request: PreviewRenderRequest,
		signal: AbortSignal,
	): Promise<string> {
		if (signal.aborted) throw signal.reason;
		await this.#open();
		if (signal.aborted) throw signal.reason;
		const channel = this.#channel;
		if (!channel) throw new Error("The preview sandbox is not connected.");
		const id = ++this.#seq;
		return new Promise<string>((resolve, reject) => {
			const onAbort = () => {
				if (!this.#pending.delete(id)) return;
				channel.post({ type: FRAME_MESSAGE.cancel, id });
				reject(signal.reason);
			};
			signal.addEventListener("abort", onAbort, { once: true });
			this.#pending.set(id, {
				resolve: (html) => {
					signal.removeEventListener("abort", onAbort);
					resolve(html);
				},
				reject: (reason) => {
					signal.removeEventListener("abort", onAbort);
					reject(reason);
				},
			});
			channel.post({ type: FRAME_MESSAGE.render, id, request });
		});
	}

	dispose(): void {
		this.#crash(new Error("Preview renderer disposed."));
	}
}

/**
 * Uses the sandbox while it is available and switches permanently to the
 * in-origin Worker when no sandbox origin can be reached, so a missing or
 * misconfigured `PUBLIC_PREVIEW_ORIGIN` degrades to "not isolated" (with a
 * console warning and the badge) instead of a broken preview.
 */
export class FallbackPreviewRenderer implements PreviewRenderer {
	readonly mode = "browser" as const;
	#current: PreviewRenderer;
	#fallback: () => PreviewRenderer;
	#warn: (message: string) => void;

	constructor(
		primary: PreviewRenderer,
		fallback: () => PreviewRenderer,
		warn: (message: string) => void = (message) => console.warn(message),
	) {
		this.#current = primary;
		this.#fallback = fallback;
		this.#warn = warn;
	}

	get isolated(): boolean {
		return this.#current.isolated;
	}

	async render(
		request: PreviewRenderRequest,
		signal: AbortSignal,
	): Promise<string> {
		try {
			return await this.#current.render(request, signal);
		} catch (error) {
			if (!(error instanceof SandboxUnavailableError)) throw error;
			this.#warn(
				`[preview] ${error.message} Falling back to an in-origin Worker.`,
			);
			this.#current.dispose();
			this.#current = this.#fallback();
			return this.#current.render(request, signal);
		}
	}

	dispose(): void {
		this.#current.dispose();
	}
}

/** Frame URLs to try for this page, best first; empty without a separate origin. */
export function defaultPreviewFrameUrls(): string[] {
	if (typeof location === "undefined" || typeof document === "undefined")
		return [];
	return previewFrameOrigins(location.origin, PREVIEW_ORIGIN).map(
		previewFrameUrl,
	);
}

export interface CreatePreviewRendererOptions {
	/** Sandbox frame URLs to try; `[]` forces the in-origin Worker. Default: `defaultPreviewFrameUrls()`. */
	frameUrls?: string[];
}

export function createPreviewRenderer(
	mode: PreviewRendererMode,
	options: CreatePreviewRendererOptions = {},
): PreviewRenderer {
	if (mode === "server") return new ServerPreviewRenderer();
	const frameUrls = options.frameUrls ?? defaultPreviewFrameUrls();
	if (frameUrls.length === 0) return new BrowserPreviewRenderer();
	return new FallbackPreviewRenderer(
		new SandboxPreviewRenderer(frameUrls),
		() => new BrowserPreviewRenderer(),
	);
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface PreviewClientOptions extends ServerPreviewRendererOptions {
	renderer?: PreviewRenderer;
	timeoutMs?: number;
}

export class PreviewClient {
	#active: ActiveRender | null = null;
	#renderer: PreviewRenderer;
	#timeoutMs: number;

	constructor(options: PreviewClientOptions = {}) {
		this.#renderer =
			options.renderer ??
			(options.fetch || options.endpoint
				? new ServerPreviewRenderer(options)
				: createPreviewRenderer(PREVIEW_RENDERER));
		this.#timeoutMs = options.timeoutMs ?? PREVIEW_TIMEOUT_MS;
	}

	get mode(): PreviewRendererMode {
		return this.#renderer.mode;
	}

	/** False only for the in-origin Worker (no sandbox origin available). */
	get isolated(): boolean {
		return this.#renderer.isolated;
	}

	/** Render a module graph built by `buildPreviewGraph` (`preview-graph.ts`). */
	async render(request: PreviewRenderRequest): Promise<string> {
		this.cancel();

		const controller = new AbortController();
		const timer = setTimeout(() => {
			controller.abort(
				new Error(`Preview timed out after ${this.#timeoutMs}ms.`),
			);
		}, this.#timeoutMs);
		this.#active = { controller, timer };

		try {
			// Only what the renderers need: a `PreviewGraph` also carries `css`.
			return await this.#renderer.render(
				{ modules: request.modules },
				controller.signal,
			);
		} catch (error) {
			if (
				controller.signal.aborted &&
				controller.signal.reason instanceof Error
			) {
				throw controller.signal.reason;
			}
			throw error;
		} finally {
			if (this.#active?.controller === controller) this.#active = null;
			clearTimeout(timer);
		}
	}

	cancel(): void {
		const active = this.#active;
		if (!active) return;
		this.#active = null;
		clearTimeout(active.timer);
		active.controller.abort(new Error("Preview cancelled."));
	}

	dispose(): void {
		this.cancel();
		this.#renderer.dispose();
	}
}

export const preview = new PreviewClient();
