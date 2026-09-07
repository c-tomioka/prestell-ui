// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
import type { CompileResult } from "@astrojs/compiler-binding";

/**
 * Module id of the entry component inside a render request. The server
 * renderer imports it statically (`preview-worker.ts`), so the name is fixed;
 * dependencies are `module-<n>.js` (see `preview-graph.ts`).
 */
export const ENTRY_MODULE_ID = "component.js";

/** One compiled `.astro` file, ready to be loaded as an ES module. */
export interface PreviewModule {
	/** `component.js` for the entry, `module-<n>.js` for its dependencies. */
	id: string;
	/**
	 * The `filename` the compiler was given: what `$$createComponent` records as
	 * `moduleId`, and therefore the key of the Container's `componentMetadata`.
	 */
	moduleId: string;
	/**
	 * Compiled code with `import "…?astro&type=style…"` and `.css` imports
	 * removed and every other project import pointed at a module id
	 * (`./module-1.js`). The runtime import stays `./runtime.js`; each renderer
	 * maps both to its own URLs / module names.
	 */
	code: string;
	scripts: CompileResult["scripts"];
	containsHead: boolean;
	propagation: boolean;
}

/**
 * What a renderer needs: the entry module plus its dependencies, dependencies
 * first (the browser renderer creates Blob URLs in this order). CSS is not
 * included — the app injects it into the preview document itself.
 */
export interface PreviewRenderRequest {
	modules: PreviewModule[];
}

export type PreviewRenderResponse =
	| { ok: true; html: string }
	| { ok: false; error: string };

/** Message protocol between `preview.ts` and `preview-browser.worker.ts`. */
export type PreviewWorkerRequest = PreviewRenderRequest & { id: number };
export type PreviewWorkerResponse = PreviewRenderResponse & { id: number };

/** Where the preview is rendered. Chosen at build time (`PUBLIC_PREVIEW_RENDERER`). */
export type PreviewRendererMode = "browser" | "server";
