// Runs inside the preview sandbox frame (`src/pages/preview/index.astro`):
// receives render requests from the app, renders them with the in-frame
// `BrowserPreviewRenderer` (a Web Worker running astro/container), and posts
// the HTML back. Nothing else lives on this origin.
import type { PreviewRenderer } from "./preview";
import {
	FRAME_MESSAGE,
	type FrameToParentMessage,
	isParentMessage,
} from "./preview-sandbox-protocol";

interface MessageSource {
	postMessage(message: unknown, targetOrigin: string): void;
}

/** The parts of `window` the frame uses (injectable for tests). */
export interface FrameHost {
	addEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void;
	removeEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void;
	parent: MessageSource | null;
}

/** Start serving render requests; returns a function that stops. */
export function startPreviewFrame(
	renderer: PreviewRenderer,
	host: FrameHost = window,
): () => void {
	const active = new Map<number, AbortController>();

	const listener = (event: MessageEvent) => {
		const data: unknown = event.data;
		if (!isParentMessage(data)) return;
		const source = event.source as MessageSource | null;
		if (!source) return;
		const reply = (message: FrameToParentMessage) =>
			source.postMessage(message, event.origin || "*");

		if (data.type === FRAME_MESSAGE.cancel) {
			active.get(data.id)?.abort(new Error("Preview cancelled."));
			return;
		}
		const controller = new AbortController();
		active.set(data.id, controller);
		renderer
			.render(data.request, controller.signal)
			.then(
				(html) =>
					reply({ type: FRAME_MESSAGE.result, id: data.id, ok: true, html }),
				(error: unknown) =>
					reply({
						type: FRAME_MESSAGE.result,
						id: data.id,
						ok: false,
						error: error instanceof Error ? error.message : String(error),
					}),
			)
			.finally(() => active.delete(data.id));
	};

	host.addEventListener("message", listener);
	host.parent?.postMessage({ type: FRAME_MESSAGE.ready }, "*");
	return () => {
		host.removeEventListener("message", listener);
		for (const controller of active.values())
			controller.abort(new Error("Preview frame stopped."));
		active.clear();
		renderer.dispose();
	};
}
