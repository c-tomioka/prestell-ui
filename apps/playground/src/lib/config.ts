// Tunable timings for the editor → compile → preview pipeline.
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
