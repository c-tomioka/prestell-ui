// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
//
// Builds the Astro Container manifest for a single compiled component. Shared
// by both preview renderers (server Worker Loader and browser Web Worker).
import type { AstroContainerOptions } from "astro/container";
import type { AstroComponentFactory } from "astro/runtime/server/index.js";
import type { PreviewRenderRequest } from "./preview-protocol";

export type { AstroComponentFactory };

const SCRIPT_ID = /\$\$renderScript\(\$\$result,\s*("(?:\\.|[^"\\])*")\s*\)/g;

function scriptIds(code: string): string[] {
	return Array.from(
		code.matchAll(SCRIPT_ID),
		(match) => JSON.parse(match[1]) as string,
	);
}

export function createManifest(
	factory: AstroComponentFactory,
	code: string,
	metadata: Omit<PreviewRenderRequest, "code">,
): NonNullable<AstroContainerOptions["manifest"]> {
	const ids = scriptIds(code);
	if (ids.length !== metadata.scripts.length) {
		throw new Error("The compiler emitted unsupported script metadata.");
	}

	const inlinedScripts = new Map<string, string>();
	for (const [index, script] of metadata.scripts.entries()) {
		if (script.type !== "inline") {
			throw new Error("External scripts are not supported in Preview.");
		}
		inlinedScripts.set(ids[index], script.code ?? "");
	}

	// astro/container derives these from `new URL(relative, import.meta.url)`.
	// Inside a Blob-URL module (browser renderer) that base is not hierarchical
	// and the URL constructor throws, so pin them to a fixed virtual root.
	const root = new URL("file:///container/");

	return {
		srcDir: new URL("./src/", root),
		publicDir: new URL("./public/", root),
		outDir: new URL("./dist/", root),
		buildClientDir: new URL("./dist/client/", root),
		buildServerDir: new URL("./dist/server/", root),
		cacheDir: new URL("./node_modules/.astro/", root),
		componentMetadata: new Map([
			[
				factory.moduleId ?? "index.astro",
				{
					containsHead: metadata.containsHead,
					propagation: metadata.propagation ? "self" : "none",
				},
			],
		]),
		inlinedScripts,
	} as NonNullable<AstroContainerOptions["manifest"]>;
}

/** URL every preview render sees as `Astro.request.url`, identical in both renderers. */
export const PREVIEW_REQUEST_URL = "https://preview.astro.build/";
