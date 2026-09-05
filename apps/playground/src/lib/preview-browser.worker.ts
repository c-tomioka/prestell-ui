/// <reference lib="webworker" />
//
// Browser renderer: renders a compiled Astro component entirely in this Web
// Worker with `astro/container`, so no server round-trip is needed.
//
// The runtime and container bundles arrive as strings (built by astro.config.ts)
// and are turned into Blob URLs; the compiled component is also loaded from a
// Blob URL after its runtime import has been pointed at the runtime Blob.
import bundles from "virtual:preview-browser-bundles";
import type { AstroComponentFactory } from "./preview-manifest";
import type {
	PreviewWorkerRequest,
	PreviewWorkerResponse,
} from "./preview-protocol";
import { rewriteRuntimeImport } from "./preview-rewrite";

type ContainerModule = typeof import("./preview-container");

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function moduleUrl(source: string): string {
	return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

const runtimeUrl = moduleUrl(bundles.runtime);
// No top-level await: the message handler is installed synchronously so no
// request posted during start-up is lost; each request awaits this instead.
const containerReady = import(
	/* @vite-ignore */ moduleUrl(bundles.container)
) as Promise<ContainerModule>;

function post(message: PreviewWorkerResponse) {
	ctx.postMessage(message);
}

ctx.onmessage = async (event: MessageEvent<PreviewWorkerRequest>) => {
	const { id, code, ...metadata } = event.data;
	let componentUrl: string | undefined;
	try {
		const { AstroContainer, createManifest, PREVIEW_REQUEST_URL } =
			await containerReady;
		componentUrl = moduleUrl(rewriteRuntimeImport(code, runtimeUrl));
		const mod = (await import(/* @vite-ignore */ componentUrl)) as {
			default?: AstroComponentFactory;
		};
		const factory = mod.default;
		if (!factory?.isAstroComponentFactory) {
			throw new Error("The compiler output did not export an Astro component.");
		}
		const container = await AstroContainer.create({
			manifest: createManifest(factory, code, metadata),
		});
		const html = await container.renderToString(factory, {
			request: new Request(PREVIEW_REQUEST_URL),
			partial: true,
		});
		post({ id, ok: true, html });
	} catch (error) {
		// Surface the stack in the console; the UI only shows the message.
		console.error("[preview.worker]", error);
		post({
			id,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
	} finally {
		if (componentUrl) URL.revokeObjectURL(componentUrl);
	}
};

ctx.addEventListener("unhandledrejection", (event) => {
	console.debug("[preview.worker] unhandledrejection", event.reason);
});
