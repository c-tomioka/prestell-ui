// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
import { compileAstroSync, parseAstroSync } from "@astrojs/compiler-binding";
import { describe, expect, it } from "vitest";
import type { ParsedAst } from "./compiler-protocol";
import {
	createPreviewRenderer,
	FallbackPreviewRenderer,
	PreviewClient,
	type SandboxChannel,
	type SandboxChannelHandlers,
	SandboxPreviewRenderer,
	SandboxUnavailableError,
	ServerPreviewRenderer,
	validatePreview,
} from "./preview";
import { buildPreviewGraph } from "./preview-graph";
import type { PreviewRenderRequest } from "./preview-protocol";
import {
	findImports,
	RUNTIME_SPECIFIER,
	rewriteImports,
	rewriteRuntimeImport,
} from "./preview-rewrite";
import {
	FRAME_MESSAGE,
	type ParentToFrameMessage,
} from "./preview-sandbox-protocol";

const filename = "index.astro";

function compile(source: string, renderable = false) {
	return compileAstroSync(source, {
		filename,
		internalURL: renderable ? "./runtime.js" : undefined,
		resolvePathProvided: renderable || undefined,
	});
}

function parse(source: string): ParsedAst {
	const parsed = parseAstroSync(source);
	return {
		ast: JSON.parse(parsed.ast),
		diagnostics: parsed.diagnostics,
	};
}

/** Single-file graph, as Playground builds it. */
function graphOf(source: string) {
	return buildPreviewGraph({
		entry: filename,
		files: { [filename]: source },
		allowImports: false,
		validate: validatePreview,
		compile: async (path, text) => ({
			result: compileAstroSync(text, {
				filename: path,
				internalURL: "./runtime.js",
				resolvePathProvided: true,
			}),
			ast: parse(text),
		}),
	});
}

describe("preview validation", () => {
	it("accepts a self-contained Astro component", () => {
		const source = `---\nconst greeting = "Hello";\n---\n<h1>{greeting}</h1>`;
		expect(validatePreview(compile(source), parse(source))).toBeNull();
	});

	it("rejects static imports", () => {
		const source = `---\nimport Card from "./Card.astro";\n---\n<Card />`;
		expect(validatePreview(compile(source), parse(source))).toBe(
			"Imports are not supported in Preview: ./Card.astro",
		);
	});

	it("delegates imports to checkImport when given", () => {
		const source = `---\nimport Card from "./Card.astro";\nimport x from "astro:content";\n---\n<Card />`;
		const seen: string[] = [];
		expect(
			validatePreview(compile(source), parse(source), (specifier) => {
				seen.push(specifier);
				return specifier.startsWith(".") ? null : `bare: ${specifier}`;
			}),
		).toBe("bare: astro:content");
		expect(seen).toEqual(["./Card.astro", "astro:content"]);
	});

	it("rejects dynamic imports", () => {
		const source = `---\nconst module = await import("./data.js");\n---\n<p>{module}</p>`;
		expect(validatePreview(compile(source), parse(source))).toBe(
			"Dynamic imports are not supported in Preview.",
		);
	});
});

describe("preview client", () => {
	it("prepares compiler output for the renderers", async () => {
		const graph = await graphOf(
			`<h1>Hello</h1><style>h1 { color: red; }</style>`,
		);
		expect(graph.modules).toHaveLength(1);
		expect(graph.modules[0].id).toBe("component.js");
		expect(graph.modules[0].moduleId).toBe(filename);
		expect(graph.modules[0].code).toContain('from "./runtime.js"');
		expect(graph.modules[0].code).not.toContain("astro&type=style");
		expect(graph.css).toEqual([expect.stringContaining("color: red")]);
	});

	it("posts the module graph to the render endpoint", async () => {
		let request: RequestInit | undefined;
		const client = new PreviewClient({
			fetch: async (_input, init) => {
				request = init;
				return Response.json({ ok: true, html: "<h1>Hello</h1>" });
			},
		});
		const graph = await graphOf(
			`<h1>Hello</h1><style>h1 { color: red; }</style>`,
		);

		await expect(client.render(graph)).resolves.toBe("<h1>Hello</h1>");
		expect(request?.method).toBe("POST");
		const body = JSON.parse(String(request?.body));
		expect(body.modules[0].code).toContain('from "./runtime.js"');
		expect(body.modules[0].code).not.toContain("astro&type=style");
		expect(body.css).toBeUndefined();
	});

	it("calls the default fetch with the global receiver", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = function (this: typeof globalThis) {
			if (this !== globalThis) throw new TypeError("Illegal invocation");
			return Promise.resolve(Response.json({ ok: true, html: "<p>Ready</p>" }));
		};
		try {
			const client = new PreviewClient({
				renderer: new ServerPreviewRenderer(),
			});
			await expect(client.render(await graphOf("<p>Ready</p>"))).resolves.toBe(
				"<p>Ready</p>",
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("cancels the active server request", async () => {
		const client = new PreviewClient({
			fetch: (_input, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(init.signal?.reason);
					});
				}),
		});
		const rendering = client.render(await graphOf("<h1>Hello</h1>"));

		client.cancel();

		await expect(rendering).rejects.toThrow("Preview cancelled.");
	});
});

describe("browser renderer helpers", () => {
	it("rewrites the runtime import to the given URL", () => {
		const result = compile(`<h1>Hello</h1>`, true);
		expect(result.code).toContain(`from "${RUNTIME_SPECIFIER}"`);
		const rewritten = rewriteRuntimeImport(result.code, "blob:null/abc");
		expect(rewritten).toContain('from "blob:null/abc"');
		expect(rewritten).not.toContain(RUNTIME_SPECIFIER);
	});

	it("leaves unrelated specifiers alone", () => {
		const code = `import x from "./runtime.json";\nimport { a } from './runtime.js';`;
		expect(rewriteRuntimeImport(code, "blob:x")).toBe(
			`import x from "./runtime.json";\nimport { a } from 'blob:x';`,
		);
	});

	it("finds, rewrites and drops top-level imports", () => {
		const code = [
			'import Layout from "../layouts/Layout.astro";',
			"import {\n\ta,\n\tb as c,\n} from './x.astro'",
			'import * as ns from "./ns.astro";',
			'import "../styles/global.css";',
			"const s = \"import y from './not-an-import.js'\";",
		].join("\n");
		expect(findImports(code).map((site) => site.specifier)).toEqual([
			"../layouts/Layout.astro",
			"./x.astro",
			"./ns.astro",
			"../styles/global.css",
		]);
		expect(
			rewriteImports(code, (specifier) =>
				specifier.endsWith(".css") ? null : `./m/${specifier}`,
			),
		).toBe(
			[
				'import Layout from "./m/../layouts/Layout.astro";',
				"import {\n\ta,\n\tb as c,\n} from './m/./x.astro';",
				'import * as ns from "./m/./ns.astro";',
				"",
				"const s = \"import y from './not-an-import.js'\";",
			].join("\n"),
		);
	});

	it("reports the renderer mode", () => {
		expect(
			new PreviewClient({ renderer: new ServerPreviewRenderer() }).mode,
		).toBe("server");
		expect(new PreviewClient({ fetch: globalThis.fetch }).mode).toBe("server");
	});
});

describe("sandbox renderer", () => {
	const request: PreviewRenderRequest = {
		modules: [
			{
				id: "component.js",
				moduleId: "index.astro",
				code: "export default {}",
				scripts: [],
				containsHead: false,
				propagation: false,
			},
		],
	};
	const A = "http://127.0.0.1:4321/preview/";
	const B = "http://[::1]:4321/preview/";

	/**
	 * Fake frames: records posted messages per url and lets the test answer
	 * them. `ready` urls post ready; `dead` urls only fire `load` (error page).
	 */
	function fakeFrames(options: { ready?: string[]; dead?: string[] } = {}) {
		const posted: ParentToFrameMessage[] = [];
		const opened: string[] = [];
		let handlers: SandboxChannelHandlers | undefined;
		let disposed = 0;
		const connect =
			(frameUrl: string) =>
			(h: SandboxChannelHandlers): SandboxChannel => {
				opened.push(frameUrl);
				handlers = h;
				if ((options.ready ?? [A, B]).includes(frameUrl))
					queueMicrotask(() => h.onMessage({ type: FRAME_MESSAGE.ready }));
				else if ((options.dead ?? []).includes(frameUrl))
					queueMicrotask(() => h.onLoad?.());
				return {
					post: (message) => posted.push(message),
					dispose: () => disposed++,
				};
			};
		return {
			options: { connect, readyTimeoutMs: 20, loadGraceMs: 2 },
			posted,
			opened,
			reply: (message: Parameters<SandboxChannelHandlers["onMessage"]>[0]) =>
				handlers?.onMessage(message),
			disposed: () => disposed,
		};
	}
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

	it("forwards renders to the frame and resolves with its html", async () => {
		const frames = fakeFrames();
		const renderer = new SandboxPreviewRenderer([A, B], frames.options);
		expect(renderer.isolated).toBe(true);
		const pending = renderer.render(request, new AbortController().signal);
		await tick();
		expect(frames.opened).toEqual([A]);
		expect(frames.posted).toEqual([
			{ type: FRAME_MESSAGE.render, id: 1, request },
		]);
		frames.reply({
			type: FRAME_MESSAGE.result,
			id: 1,
			ok: true,
			html: "<p>ok</p>",
		});
		await expect(pending).resolves.toBe("<p>ok</p>");
		frames.reply({
			type: FRAME_MESSAGE.result,
			id: 1,
			ok: false,
			error: "late",
		}); // ignored
	});

	it("skips candidates that show an error page or never say ready", async () => {
		const frames = fakeFrames({ dead: [A], ready: [B] });
		const renderer = new SandboxPreviewRenderer([A, B], frames.options);
		const pending = renderer.render(request, new AbortController().signal);
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(frames.opened).toEqual([A, B]);
		expect(frames.disposed()).toBe(1);
		frames.reply({ type: FRAME_MESSAGE.result, id: 1, ok: true, html: "b" });
		await expect(pending).resolves.toBe("b");

		const silent = fakeFrames({ ready: [B] });
		const second = new SandboxPreviewRenderer([A, B], silent.options);
		const again = second.render(request, new AbortController().signal);
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(silent.opened).toEqual([A, B]);
		expect(silent.disposed()).toBe(1);
		silent.reply({ type: FRAME_MESSAGE.result, id: 1, ok: true, html: "b2" });
		await expect(again).resolves.toBe("b2");
	});

	it("rejects with the frame's error", async () => {
		const frames = fakeFrames();
		const renderer = new SandboxPreviewRenderer([A], frames.options);
		const pending = renderer.render(request, new AbortController().signal);
		await tick();
		frames.reply({
			type: FRAME_MESSAGE.result,
			id: 1,
			ok: false,
			error: "boom",
		});
		await expect(pending).rejects.toThrow("boom");
	});

	it("cancels in the frame when aborted", async () => {
		const frames = fakeFrames();
		const renderer = new SandboxPreviewRenderer([A], frames.options);
		const controller = new AbortController();
		const pending = renderer.render(request, controller.signal);
		await tick();
		controller.abort(new Error("Preview timed out after 5000ms."));
		await expect(pending).rejects.toThrow("timed out");
		expect(frames.posted.at(-1)).toEqual({ type: FRAME_MESSAGE.cancel, id: 1 });
	});

	it("reports SandboxUnavailableError when every candidate fails, and retries later", async () => {
		const frames = fakeFrames({ ready: [], dead: [A, B] });
		const renderer = new SandboxPreviewRenderer([A, B], frames.options);
		await expect(
			renderer.render(request, new AbortController().signal),
		).rejects.toBeInstanceOf(SandboxUnavailableError);
		expect(frames.opened).toEqual([A, B]);
		// The next render tries again (the server may have come up).
		await expect(
			renderer.render(request, new AbortController().signal),
		).rejects.toThrow("No preview sandbox origin is available");
		expect(frames.opened).toEqual([A, B, A, B]);
	});

	it("falls back to the in-origin worker once the sandbox is unavailable", async () => {
		const warnings: string[] = [];
		const fallback = {
			mode: "browser" as const,
			isolated: false,
			render: async () => "<b>local</b>",
			dispose: () => {},
		};
		const renderer = new FallbackPreviewRenderer(
			new SandboxPreviewRenderer(
				[A],
				fakeFrames({ ready: [], dead: [A, B] }).options,
			),
			() => fallback,
			(message) => warnings.push(message),
		);
		expect(renderer.isolated).toBe(true);
		await expect(
			renderer.render(request, new AbortController().signal),
		).resolves.toBe("<b>local</b>");
		expect(renderer.isolated).toBe(false);
		expect(warnings[0]).toContain("Falling back to an in-origin Worker");
	});

	it("uses the in-origin worker when there is no frame url", () => {
		const renderer = createPreviewRenderer("browser", { frameUrls: [] });
		expect(renderer.mode).toBe("browser");
		expect(renderer.isolated).toBe(false);
		expect(createPreviewRenderer("server").isolated).toBe(true);
		expect(createPreviewRenderer("browser", { frameUrls: [A] }).isolated).toBe(
			true,
		);
	});
});
