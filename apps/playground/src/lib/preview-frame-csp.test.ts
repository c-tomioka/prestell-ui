import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PREVIEW_FRAME_CSP, PREVIEW_FRAME_CSP_DEV } from "./preview-frame-csp";

describe("preview frame CSP", () => {
	it("blocks the network and matches public/_headers", () => {
		expect(PREVIEW_FRAME_CSP).toContain("connect-src 'none'");
		expect(PREVIEW_FRAME_CSP).toContain("default-src 'none'");
		const headers = readFileSync(
			new URL("../../public/_headers", import.meta.url),
			"utf8",
		);
		expect(headers).toContain(
			`/preview/*\n  Content-Security-Policy: ${PREVIEW_FRAME_CSP}\n`,
		);
		expect(headers).toContain("Cross-Origin-Resource-Policy: cross-origin");
	});

	it("only relaxes connect-src for the dev HMR socket", () => {
		expect(PREVIEW_FRAME_CSP_DEV).not.toContain("connect-src 'none'");
		expect(PREVIEW_FRAME_CSP_DEV).toContain(
			"connect-src ws://localhost:* ws://127.0.0.1:*",
		);
		expect(
			PREVIEW_FRAME_CSP_DEV.replace(/connect-src [^;]+/, "connect-src 'none'"),
		).toBe(PREVIEW_FRAME_CSP);
	});
});
