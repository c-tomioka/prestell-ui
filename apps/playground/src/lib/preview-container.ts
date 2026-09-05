// Browser renderer bundle entry. Bundled by astro.config.ts (rolldown, platform
// "browser") into a self-contained ES module string that the preview Web Worker
// loads from a Blob URL. Must not import anything Node-specific.
export { experimental_AstroContainer as AstroContainer } from "astro/container";
export type { AstroComponentFactory } from "./preview-manifest";
export { createManifest, PREVIEW_REQUEST_URL } from "./preview-manifest";
