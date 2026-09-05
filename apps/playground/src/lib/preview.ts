// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
//
// Preview pipeline: validate the compile result, hand the prepared code to a
// renderer, and wrap the rendered HTML into a sandboxed document.
//
// Two renderers implement the same contract:
//   - BrowserPreviewRenderer: astro/container inside a Web Worker (default, no server)
//   - ServerPreviewRenderer:  POST /api/render → Worker Loader dynamic Worker
// The active one is chosen at build time via PUBLIC_PREVIEW_RENDERER (see config.ts).
import type { CompileResult } from "@astrojs/compiler-binding";
import type { ParsedAst } from "./compiler-protocol";
import { PREVIEW_RENDERER, PREVIEW_TIMEOUT_MS } from "./config";
import type {
	PreviewRendererMode,
	PreviewRenderRequest,
	PreviewRenderResponse,
	PreviewWorkerRequest,
	PreviewWorkerResponse,
} from "./preview-protocol";

export type { PreviewRendererMode };

interface ActiveRender {
	controller: AbortController;
	timer: ReturnType<typeof setTimeout>;
}

const STYLE_IMPORT =
	/^import\s+["'](?:[^"'\\]|\\.)*\?astro&type=style&(?:[^"'\\]|\\.)*["'];?\s*$/gm;

interface AstNode {
	type?: unknown;
	source?: {
		value?: unknown;
	};
}

function moduleSyntaxError(ast: unknown): string | null {
	const stack: unknown[] = [ast];
	const seen = new WeakSet<object>();

	while (stack.length > 0) {
		const value = stack.pop();
		if (!value || typeof value !== "object" || seen.has(value)) continue;
		seen.add(value);

		const node = value as AstNode;
		if (node.type === "ImportDeclaration") {
			const specifier = node.source?.value;
			return typeof specifier === "string"
				? `Imports are not supported in Preview: ${specifier}`
				: "Imports are not supported in Preview.";
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

		for (const child of Object.values(value)) {
			if (child && typeof child === "object") stack.push(child);
		}
	}

	return null;
}

export function validatePreview(
	result: CompileResult,
	ast: ParsedAst,
): string | null {
	if (
		result.diagnostics.some((diagnostic) => diagnostic.severity === "error")
	) {
		return "Fix compiler errors before rendering the preview.";
	}

	const syntaxError = moduleSyntaxError(ast.ast);
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

export function createPreviewDocument(html: string, css: string[]): string {
	const document = new DOMParser().parseFromString(html, "text/html");
	const csp = document.createElement("meta");
	csp.httpEquiv = "Content-Security-Policy";
	csp.content = [
		"default-src 'none'",
		"base-uri 'none'",
		"script-src 'unsafe-inline'",
		"style-src 'unsafe-inline'",
		"img-src data: blob:",
		"media-src data: blob:",
		"font-src data:",
		"connect-src 'none'",
		"form-action 'none'",
	].join("; ");

	const viewport = document.createElement("meta");
	viewport.name = "viewport";
	viewport.content = "width=device-width, initial-scale=1";

	const style = document.createElement("style");
	style.textContent = css.join("\n\n");
	document.head.prepend(csp, viewport, style);

	return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

export function preparePreviewCode(code: string): string {
	return code.replace(STYLE_IMPORT, "");
}

export function toPreviewRequest(result: CompileResult): PreviewRenderRequest {
	return {
		code: preparePreviewCode(result.code),
		scripts: result.scripts.map((script) =>
			script.type === "inline"
				? { type: "inline", code: script.code }
				: { type: "external", src: script.src },
		),
		containsHead: result.containsHead,
		propagation: result.propagation,
	};
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export interface PreviewRenderer {
	readonly mode: PreviewRendererMode;
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

export function createPreviewRenderer(
	mode: PreviewRendererMode,
): PreviewRenderer {
	return mode === "server"
		? new ServerPreviewRenderer()
		: new BrowserPreviewRenderer();
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

	async render(result: CompileResult): Promise<string> {
		this.cancel();

		const controller = new AbortController();
		const timer = setTimeout(() => {
			controller.abort(
				new Error(`Preview timed out after ${this.#timeoutMs}ms.`),
			);
		}, this.#timeoutMs);
		this.#active = { controller, timer };

		try {
			return await this.#renderer.render(
				toPreviewRequest(result),
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
