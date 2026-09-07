// Message protocol between the app and the preview sandbox frame
// (`src/pages/preview/index.astro` + `preview-frame.ts`).
//
// The frame is served from a different origin than the app, so generated
// frontmatter code — which runs in a Web Worker inside the frame — cannot reach
// the app's IndexedDB / localStorage, and the frame's CSP (`connect-src 'none'`)
// blocks network access from the Worker too.
import type {
	PreviewRenderRequest,
	PreviewRenderResponse,
} from "./preview-protocol";

/** Route of the frame page, on the preview origin. */
export const PREVIEW_FRAME_PATH = "/preview/";

export const FRAME_MESSAGE = {
	ready: "prestell:preview-ready",
	render: "prestell:preview-render",
	cancel: "prestell:preview-cancel",
	result: "prestell:preview-result",
} as const;

export type ParentToFrameMessage =
	| {
			type: typeof FRAME_MESSAGE.render;
			id: number;
			request: PreviewRenderRequest;
	  }
	| { type: typeof FRAME_MESSAGE.cancel; id: number };

export type FrameToParentMessage =
	| { type: typeof FRAME_MESSAGE.ready }
	| ({ type: typeof FRAME_MESSAGE.result; id: number } & PreviewRenderResponse);

function hasType(data: unknown): data is { type: unknown; id?: unknown } {
	return typeof data === "object" && data !== null && "type" in data;
}

export function isParentMessage(data: unknown): data is ParentToFrameMessage {
	if (!hasType(data) || typeof data.id !== "number") return false;
	return (
		data.type === FRAME_MESSAGE.render || data.type === FRAME_MESSAGE.cancel
	);
}

export function isFrameMessage(data: unknown): data is FrameToParentMessage {
	if (!hasType(data)) return false;
	if (data.type === FRAME_MESSAGE.ready) return true;
	return data.type === FRAME_MESSAGE.result && typeof data.id === "number";
}

/** `https://host[:port]` for a URL or origin string; null when unparsable. */
export function normaliseOrigin(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(
			trimmed.includes("://") ? trimmed : `https://${trimmed}`,
		);
		return url.origin === "null" ? null : url.origin;
	} catch {
		return null;
	}
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Origins the sandbox frame may be loaded from, best first; empty when the
 * preview cannot be isolated (the app then falls back to an in-origin Worker
 * and says so in the badge).
 *
 * - `configured` (`PUBLIC_PREVIEW_ORIGIN`) is the only candidate when set and
 *   different from the app.
 * - Otherwise, on a loopback dev server, the other loopback spellings are
 *   tried: same server, different origin, no extra process. Which of them the
 *   server actually listens on depends on the OS, so the renderer probes them.
 */
export function previewFrameOrigins(
	appOrigin: string,
	configured?: string,
): string[] {
	const app = normaliseOrigin(appOrigin);
	const wanted = normaliseOrigin(configured);
	if (wanted) return wanted === app ? [] : [wanted];
	if (!app) return [];
	const url = new URL(app);
	if (!LOOPBACK_HOSTS.includes(url.hostname === "::1" ? "[::1]" : url.hostname))
		return [];
	const current = url.hostname === "::1" ? "[::1]" : url.hostname;
	return LOOPBACK_HOSTS.filter((host) => host !== current).map(
		(host) => `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`,
	);
}

/** First candidate, kept for callers that only need one (tests, docs). */
export function previewFrameOrigin(
	appOrigin: string,
	configured?: string,
): string | null {
	return previewFrameOrigins(appOrigin, configured)[0] ?? null;
}

export function previewFrameUrl(origin: string): string {
	return `${origin}${PREVIEW_FRAME_PATH}`;
}
