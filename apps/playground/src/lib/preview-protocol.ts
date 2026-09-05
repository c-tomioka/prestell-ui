// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
import type { CompileResult } from "@astrojs/compiler-binding";

export interface PreviewRenderRequest {
	code: string;
	scripts: CompileResult["scripts"];
	containsHead: boolean;
	propagation: boolean;
}

export type PreviewRenderResponse =
	| { ok: true; html: string }
	| { ok: false; error: string };

/** Message protocol between `preview.ts` and `preview-browser.worker.ts`. */
export type PreviewWorkerRequest = PreviewRenderRequest & { id: number };
export type PreviewWorkerResponse = PreviewRenderResponse & { id: number };

/** Where the preview is rendered. Chosen at build time (`PUBLIC_PREVIEW_RENDERER`). */
export type PreviewRendererMode = "browser" | "server";
