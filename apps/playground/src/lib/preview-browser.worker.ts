/// <reference lib="webworker" />
//
// Browser renderer: renders a compiled Astro module graph entirely in this Web
// Worker with `astro/container`, so no server round-trip is needed.
//
// The runtime and container bundles arrive as strings (built by astro.config.ts)
// and are turned into Blob URLs. Each compiled module is loaded from a Blob URL
// too, dependencies first, with its runtime and module imports pointed at the
// Blob URLs created before it.
import bundles from "virtual:preview-browser-bundles";
import type { AstroComponentFactory } from "./preview-manifest";
import {
	ENTRY_MODULE_ID,
	type PreviewWorkerRequest,
	type PreviewWorkerResponse,
} from "./preview-protocol";
import { RUNTIME_SPECIFIER, rewriteImports } from "./preview-rewrite";

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
	const { id, modules } = event.data;
	const urls = new Map<string, string>();
	try {
		const { AstroContainer, createManifest, PREVIEW_REQUEST_URL } =
			await containerReady;
		for (const module of modules) {
			const code = rewriteImports(module.code, (specifier) => {
				if (specifier === RUNTIME_SPECIFIER) return runtimeUrl;
				const url = urls.get(specifier.replace(/^\.\//, ""));
				if (!url) throw new Error(`Unresolved preview import: ${specifier}`);
				return url;
			});
			urls.set(module.id, moduleUrl(code));
		}
		const entryUrl = urls.get(ENTRY_MODULE_ID);
		if (!entryUrl) throw new Error("The preview request has no entry module.");
		const mod = (await import(/* @vite-ignore */ entryUrl)) as {
			default?: AstroComponentFactory;
		};
		const factory = mod.default;
		if (!factory?.isAstroComponentFactory) {
			throw new Error("The compiler output did not export an Astro component.");
		}
		const container = await AstroContainer.create({
			manifest: createManifest(modules),
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
		for (const url of urls.values()) URL.revokeObjectURL(url);
	}
};

ctx.addEventListener("unhandledrejection", (event) => {
	console.debug("[preview.worker] unhandledrejection", event.reason);
});
