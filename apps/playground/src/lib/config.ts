// Tunables for the editor → compile → preview pipeline.
import type { PreviewRendererMode } from "./preview-protocol";

/**
 * Where the preview is rendered. Set at build/dev time with
 * `PUBLIC_PREVIEW_RENDERER=browser|server` (see astro.config.ts). Defaults to
 * "browser": astro/container runs in a Web Worker and nothing is sent to a server.
 */
export const PREVIEW_RENDERER: PreviewRendererMode =
	typeof __PREVIEW_RENDERER__ === "string" ? __PREVIEW_RENDERER__ : "browser";

/**
 * Origin that serves the preview sandbox frame (`/preview/`), e.g.
 * `https://preview.example.com`. Set with `PUBLIC_PREVIEW_ORIGIN` at build
 * time. Unset: the dev server swaps `localhost` ↔ `127.0.0.1`; elsewhere the
 * preview renders in an in-origin Worker and the badge says "not isolated".
 */
export const PREVIEW_ORIGIN: string | undefined =
	(import.meta.env?.PUBLIC_PREVIEW_ORIGIN as string | undefined)?.trim() ||
	undefined;

/**
 * Which chat connections this build offers. `both` (default) shows the
 * Server / Direct switch; `direct` is the static-host build (no `/api/*`, the
 * switch is hidden and the server is never called); `server` hides direct.
 * Set with `PUBLIC_AI_CONNECTIONS` at build time (`pnpm build:static` sets `direct`).
 */
export type AiConnections = "both" | "direct" | "server";
const AI_CONNECTIONS_VALUES: readonly string[] = ["both", "direct", "server"];
function readAiConnections(): AiConnections {
	const value = (import.meta.env?.PUBLIC_AI_CONNECTIONS as string | undefined)
		?.trim()
		.toLowerCase();
	return value && AI_CONNECTIONS_VALUES.includes(value)
		? (value as AiConnections)
		: "both";
}
export const AI_CONNECTIONS: AiConnections = readAiConnections();
//
// Preview rendering is the only step that calls the server (`POST /api/render`,
// a Worker Loader dynamic Worker per render), so these knobs directly control
// server cost when the app is deployed. Compiling is local (WASM) and cheap.

/** Idle time after the last keystroke before the WASM compiler runs. */
export const COMPILE_DEBOUNCE_MS = 200;

/**
 * Extra idle time after a successful compile before the preview is rendered
 * on the server. `0` keeps the original behaviour (render right after compile).
 * Raise it (e.g. 800) to cut `/api/render` calls while typing.
 */
export const PREVIEW_DEBOUNCE_MS = 0;

/** Abort a preview render that takes longer than this. */
export const PREVIEW_TIMEOUT_MS = 5000;

/** Terminate and respawn the compiler worker if a request hangs this long. */
export const COMPILER_TIMEOUT_MS = 8000;

/** Idle time after the last edit before the project is written to IndexedDB. */
export const PROJECT_SAVE_DEBOUNCE_MS = 500;
