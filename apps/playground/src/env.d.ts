// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
/// <reference types="astro/client" />

declare module "virtual:preview-worker-source" {
	const bundle: {
		mainModule: string;
		modules: Record<string, string>;
	};
	export default bundle;
}

declare module "virtual:preview-browser-bundles" {
	/** Self-contained ES module sources for the browser renderer (see astro.config.ts). */
	const bundles: {
		runtime: string;
		container: string;
	};
	export default bundles;
}

/** Injected by astro.config.ts from PUBLIC_PREVIEW_RENDERER; undefined in plain vitest runs. */
declare const __PREVIEW_RENDERER__: "browser" | "server" | undefined;

declare module "cloudflare:workers" {
	export const env: Env;
}

// The WASM binding (`@astrojs/compiler-binding-wasm32-wasi`) ships no type
// declarations, but its runtime API is identical to the native binding's.
// Re-export those types so imports from the WASM package are fully typed.
declare module "@astrojs/compiler-binding-wasm32-wasi" {
	export * from "@astrojs/compiler-binding";
}
