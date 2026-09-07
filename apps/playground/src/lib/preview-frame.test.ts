import { describe, expect, it, vi } from "vitest";
import type { PreviewRenderer } from "./preview";
import { type FrameHost, startPreviewFrame } from "./preview-frame";
import type { PreviewRenderRequest } from "./preview-protocol";
import { FRAME_MESSAGE } from "./preview-sandbox-protocol";

const request: PreviewRenderRequest = {
	modules: [
		{
			id: "component.js",
			moduleId: "index.astro",
			code: "export default {}",
			scripts: [],
			containsHead: false,
			propagation: false,
		},
	],
};

function fakeHost() {
	const listeners = new Set<(event: MessageEvent) => void>();
	const parent = { postMessage: vi.fn() };
	const host: FrameHost = {
		addEventListener: (_type, listener) => listeners.add(listener),
		removeEventListener: (_type, listener) => listeners.delete(listener),
		parent,
	};
	const source = { postMessage: vi.fn() };
	const deliver = (data: unknown) => {
		for (const listener of listeners)
			listener({
				data,
				origin: "http://localhost:4321",
				source,
			} as unknown as MessageEvent);
	};
	return { host, parent, source, deliver };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("startPreviewFrame", () => {
	it("announces itself and answers render requests to the sender", async () => {
		const { host, parent, source, deliver } = fakeHost();
		const renderer: PreviewRenderer = {
			mode: "browser",
			isolated: false,
			render: vi.fn(async () => "<p>hi</p>"),
			dispose: vi.fn(),
		};
		const stop = startPreviewFrame(renderer, host);
		expect(parent.postMessage).toHaveBeenCalledWith(
			{ type: FRAME_MESSAGE.ready },
			"*",
		);
		deliver({ type: FRAME_MESSAGE.render, id: 7, request });
		await flush();
		expect(source.postMessage).toHaveBeenCalledWith(
			{ type: FRAME_MESSAGE.result, id: 7, ok: true, html: "<p>hi</p>" },
			"http://localhost:4321",
		);
		deliver("junk");
		stop();
		expect(renderer.dispose).toHaveBeenCalled();
	});

	it("reports render errors and forwards cancellation as an abort", async () => {
		const { host, source, deliver } = fakeHost();
		let seen: AbortSignal | undefined;
		const renderer: PreviewRenderer = {
			mode: "browser",
			isolated: false,
			render: (_request, signal) =>
				new Promise((_resolve, reject) => {
					seen = signal;
					signal.addEventListener("abort", () => reject(signal.reason));
				}),
			dispose: () => {},
		};
		startPreviewFrame(renderer, host);
		deliver({ type: FRAME_MESSAGE.render, id: 1, request });
		deliver({ type: FRAME_MESSAGE.cancel, id: 1 });
		await flush();
		expect(seen?.aborted).toBe(true);
		expect(source.postMessage).toHaveBeenCalledWith(
			{
				type: FRAME_MESSAGE.result,
				id: 1,
				ok: false,
				error: "Preview cancelled.",
			},
			"http://localhost:4321",
		);
	});
});
