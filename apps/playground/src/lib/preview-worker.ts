// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
//
// Server renderer: runs inside a Worker Loader dynamic Worker (see pages/api/render.ts).
import { experimental_AstroContainer as AstroContainer } from "astro/container";
// The generated component is supplied as a second module by Worker Loader.
// @ts-expect-error There is intentionally no component.js on disk.
import component from "./component.js";
import {
	type AstroComponentFactory,
	createManifest,
	PREVIEW_REQUEST_URL,
} from "./preview-manifest";
import type { PreviewRenderRequest } from "./preview-protocol";

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		const { code, ...metadata } =
			(await request.json()) as PreviewRenderRequest;
		const factory = component as AstroComponentFactory;
		if (!factory?.isAstroComponentFactory) {
			throw new Error("The compiler output did not export an Astro component.");
		}

		const container = await AstroContainer.create({
			manifest: createManifest(factory, code, metadata),
		});
		return container.renderToResponse(factory, {
			request: new Request(PREVIEW_REQUEST_URL),
			partial: true,
		});
	},
};
