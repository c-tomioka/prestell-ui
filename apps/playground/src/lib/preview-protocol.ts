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
