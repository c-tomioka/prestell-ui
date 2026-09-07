import { describe, expect, it } from "vitest";
import {
	isFrameMessage,
	isParentMessage,
	previewFrameOrigin,
	previewFrameOrigins,
	previewFrameUrl,
} from "./preview-sandbox-protocol";

describe("previewFrameOrigin", () => {
	it("offers the other loopback spellings on the dev server", () => {
		expect(previewFrameOrigins("http://localhost:4321")).toEqual([
			"http://127.0.0.1:4321",
			"http://[::1]:4321",
		]);
		expect(previewFrameOrigins("http://127.0.0.1:4321")).toEqual([
			"http://localhost:4321",
			"http://[::1]:4321",
		]);
		expect(previewFrameOrigins("http://[::1]:4321")).toEqual([
			"http://localhost:4321",
			"http://127.0.0.1:4321",
		]);
		expect(previewFrameOrigin("http://localhost:4321")).toBe(
			"http://127.0.0.1:4321",
		);
	});

	it("prefers the configured origin and normalises it", () => {
		expect(
			previewFrameOrigin(
				"http://localhost:4321",
				"https://preview.example.com/",
			),
		).toBe("https://preview.example.com");
		expect(
			previewFrameOrigin("https://app.example.com", "preview.example.com"),
		).toBe("https://preview.example.com");
	});

	it("returns null when no separate origin is available", () => {
		expect(previewFrameOrigins("https://app.example.com")).toEqual([]);
		expect(previewFrameOrigin("https://app.example.com")).toBeNull();
		expect(
			previewFrameOrigin("https://app.example.com", "https://app.example.com"),
		).toBeNull();
		expect(
			previewFrameOrigin("https://app.example.com", "not a url"),
		).toBeNull();
	});

	it("builds the frame url", () => {
		expect(previewFrameUrl("http://127.0.0.1:4321")).toBe(
			"http://127.0.0.1:4321/preview/",
		);
	});
});

describe("message guards", () => {
	it("accepts only well-formed messages", () => {
		expect(isParentMessage({ type: "prestell:preview-cancel", id: 1 })).toBe(
			true,
		);
		expect(isParentMessage({ type: "prestell:preview-render", id: "1" })).toBe(
			false,
		);
		expect(isParentMessage({ type: "prestell:preview-ready" })).toBe(false);
		expect(isFrameMessage({ type: "prestell:preview-ready" })).toBe(true);
		expect(
			isFrameMessage({
				type: "prestell:preview-result",
				id: 2,
				ok: true,
				html: "",
			}),
		).toBe(true);
		expect(isFrameMessage({ type: "prestell:preview-result" })).toBe(false);
		expect(isFrameMessage("nope")).toBe(false);
	});
});
