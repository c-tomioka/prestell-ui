// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import { rolldown } from "rolldown";
import {
	type Connect,
	loadEnv,
	type Plugin,
	type PreviewServer,
	searchForWorkspaceRoot,
	type UserConfig,
	type ViteDevServer,
} from "vite";
import {
	PREVIEW_FRAME_CSP,
	PREVIEW_FRAME_CSP_DEV,
} from "./src/lib/preview-frame-csp";

/**
 * Preview renderer selection. `browser` (default) renders inside a Web Worker;
 * `server` keeps the Worker Loader route (`/api/render`).
 *   PUBLIC_PREVIEW_RENDERER=server astro dev   (or `pnpm dev:server`)
 */
function previewRenderer(): "browser" | "server" {
	const env = loadEnv(
		process.env.NODE_ENV ?? "development",
		process.cwd(),
		"PUBLIC_",
	);
	const value = (
		env.PUBLIC_PREVIEW_RENDERER ??
		process.env.PUBLIC_PREVIEW_RENDERER ??
		"browser"
	)
		.trim()
		.toLowerCase();
	if (value !== "browser" && value !== "server") {
		throw new Error(
			`PUBLIC_PREVIEW_RENDERER must be "browser" or "server" (got "${value}").`,
		);
	}
	return value;
}
const PREVIEW_RENDERER = previewRenderer();

/**
 * The Rust compiler's WASM build (`wasm32-wasip1-threads`) instantiates a
 * SharedArrayBuffer + Web Worker, which requires the page to be
 * cross-origin isolated. In production these headers are served on the
 * prerendered HTML via `public/_headers`.
 */
const COI_HEADERS = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "credentialless",
	// The preview sandbox frame is loaded cross-origin (localhost ↔ 127.0.0.1 in
	// dev), which COEP only allows when the frame's responses carry CORP.
	"Cross-Origin-Resource-Policy": "cross-origin",
};

/** The sandbox frame page (`src/pages/preview/index.astro`); see `public/_headers`. */
function isPreviewFramePath(url: string | undefined): boolean {
	const path = (url ?? "").split("?")[0];
	return (
		path === "/preview" ||
		path === "/preview/" ||
		path === "/preview/index.html"
	);
}

/**
 * Force COOP/COEP on every dev/preview response — including the HTML document,
 * which the Cloudflare dev middleware renders and serves without picking up
 * Astro's `server.headers` — and the sandbox CSP on the preview frame. We
 * unshift to the front of the connect stack so it runs before the Cloudflare
 * middleware writes the response.
 */
function crossOriginIsolation(): Plugin {
	const apply = (server: PreviewServer | ViteDevServer, dev: boolean) => {
		const handle: Connect.NextHandleFunction = (req, res, next) => {
			for (const [key, value] of Object.entries(COI_HEADERS)) {
				res.setHeader(key, value);
			}
			if (isPreviewFramePath(req.url)) {
				res.setHeader(
					"Content-Security-Policy",
					dev ? PREVIEW_FRAME_CSP_DEV : PREVIEW_FRAME_CSP,
				);
			}
			next();
		};
		server.middlewares.stack.unshift({
			route: "",
			handle,
		});
	};
	return {
		name: "playground:cross-origin-isolation",
		configureServer: (server) => apply(server, true),
		configurePreviewServer: (server) => apply(server, false),
	};
}

const PREVIEW_WORKER_SOURCE = "virtual:preview-worker-source";
const RESOLVED_PREVIEW_WORKER_SOURCE = `\0${PREVIEW_WORKER_SOURCE}`;

interface PreviewWorkerBundle {
	mainModule: string;
	modules: Record<string, string>;
}

function previewWorkerSource(): Plugin {
	const entryPoint = fileURLToPath(
		new URL("./src/lib/preview-worker.ts", import.meta.url),
	);
	const runtimeEntryPoint = fileURLToPath(
		new URL("./src/lib/preview-runtime.ts", import.meta.url),
	);
	let workerBundle: PreviewWorkerBundle | undefined;

	return {
		name: "playground:preview-worker-source",
		resolveId(id) {
			if (id === PREVIEW_WORKER_SOURCE) return RESOLVED_PREVIEW_WORKER_SOURCE;
		},
		async load(id) {
			if (id !== RESOLVED_PREVIEW_WORKER_SOURCE) return;
			this.addWatchFile(entryPoint);
			this.addWatchFile(runtimeEntryPoint);
			if (!workerBundle) {
				const bundle = await rolldown({
					input: {
						runtime: runtimeEntryPoint,
						worker: entryPoint,
					},
					external: (specifier, importer) =>
						specifier === "./component.js" && importer === entryPoint,
					transform: {
						define: {
							"process.env.NODE_ENV": JSON.stringify("production"),
						},
					},
				});
				try {
					const result = await bundle.generate();
					const chunks = result.output.filter(
						(output) => output.type === "chunk",
					);
					if (chunks.length !== result.output.length) {
						throw new Error(
							"Preview worker bundling produced a non-JavaScript asset.",
						);
					}
					const entry = chunks.find(
						(chunk) => chunk.facadeModuleId === entryPoint,
					);
					if (!entry)
						throw new Error("Preview worker bundle has no entry module.");
					workerBundle = {
						mainModule: entry.fileName,
						modules: Object.fromEntries(
							chunks.map((chunk) => [chunk.fileName, chunk.code]),
						),
					};
				} finally {
					await bundle.close();
				}
			}
			return `export default ${JSON.stringify(workerBundle)};`;
		},
		watchChange(id) {
			if (id === entryPoint || id === runtimeEntryPoint)
				workerBundle = undefined;
		},
	};
}

const PREVIEW_BROWSER_BUNDLES = "virtual:preview-browser-bundles";
const RESOLVED_PREVIEW_BROWSER_BUNDLES = `\0${PREVIEW_BROWSER_BUNDLES}`;

interface PreviewBrowserBundles {
	runtime: string;
	container: string;
}

/**
 * Bundles `astro/compiler-runtime` and `astro/container` as two self-contained
 * browser ES modules (one rolldown build each, so they never share a chunk)
 * and exposes their sources to the preview Web Worker, which loads them from
 * Blob URLs. Any `node:*` import is a hard error: the render path must stay
 * Web-platform only (see docs/PREVIEW_RENDERING.md).
 */
function previewBrowserBundles(): Plugin {
	const entries = {
		runtime: fileURLToPath(
			new URL("./src/lib/preview-runtime.ts", import.meta.url),
		),
		container: fileURLToPath(
			new URL("./src/lib/preview-container.ts", import.meta.url),
		),
	};
	let bundles: PreviewBrowserBundles | undefined;

	async function bundleBrowserModule(input: string): Promise<string> {
		const bundle = await rolldown({
			input,
			platform: "browser",
			plugins: [
				{
					name: "playground:forbid-node-builtins",
					resolveId(id) {
						if (id.startsWith("node:")) {
							throw new Error(
								`The browser preview renderer must not depend on ${id} (imported while bundling ${input}).`,
							);
						}
					},
				},
			],
			transform: {
				define: { "process.env.NODE_ENV": JSON.stringify("production") },
			},
		});
		try {
			const result = await bundle.generate({ format: "es" });
			const chunks = result.output.filter((output) => output.type === "chunk");
			if (chunks.length !== 1 || chunks.length !== result.output.length) {
				throw new Error(`Expected a single self-contained chunk for ${input}.`);
			}
			return chunks[0].code;
		} finally {
			await bundle.close();
		}
	}

	return {
		name: "playground:preview-browser-bundles",
		resolveId(id) {
			if (id === PREVIEW_BROWSER_BUNDLES)
				return RESOLVED_PREVIEW_BROWSER_BUNDLES;
		},
		async load(id) {
			if (id !== RESOLVED_PREVIEW_BROWSER_BUNDLES) return;
			for (const entry of Object.values(entries)) this.addWatchFile(entry);
			if (!bundles) {
				bundles = {
					runtime: await bundleBrowserModule(entries.runtime),
					container: await bundleBrowserModule(entries.container),
				};
			}
			return `export default ${JSON.stringify(bundles)};`;
		},
		watchChange(id) {
			if (Object.values(entries).includes(id)) bundles = undefined;
		},
	};
}

const vite: UserConfig = {
	plugins: [
		crossOriginIsolation(),
		previewWorkerSource(),
		previewBrowserBundles(),
	],
	define: {
		__PREVIEW_RENDERER__: JSON.stringify(PREVIEW_RENDERER),
	},
	// The WASM binding ships hand-written browser glue that uses
	// `new URL('./x.wasm', import.meta.url)` and `new Worker(new URL(...))`.
	// Pre-bundling rewrites those URLs and breaks them, so exclude it.
	optimizeDeps: {
		exclude: ["@astrojs/compiler-binding-wasm32-wasi"],
	},
	worker: {
		format: "es",
		// Production worker bundles get their own plugin pipeline; the preview
		// Worker imports the virtual bundles module, so it needs this plugin too.
		plugins: () => [previewBrowserBundles()],
	},
	build: {
		// CodeMirror + the compiler island are legitimately large single chunks.
		chunkSizeWarningLimit: 2000,
	},
	server: {
		fs: {
			// In a pnpm monorepo the hoisted WASM package lives at the workspace
			// root, outside this package — allow Vite's dev server to serve it.
			allow: [searchForWorkspaceRoot(process.cwd())],
		},
	},
};

// https://astro.build/config
export default defineConfig({
	integrations: [svelte()],
	adapter: cloudflare(),
	server: {
		headers: COI_HEADERS,
	},
	vite,
});
