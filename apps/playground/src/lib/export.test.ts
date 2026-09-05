import { describe, expect, it } from "vitest";
import { normalizeFilename } from "./export";

describe("normalizeFilename", () => {
	it("adds the .astro extension", () => {
		expect(normalizeFilename("Hero")).toBe("Hero.astro");
	});
	it("keeps an existing extension", () => {
		expect(normalizeFilename("index.astro")).toBe("index.astro");
	});
	it("strips path separators and falls back to index.astro", () => {
		expect(normalizeFilename("a/b:c")).toBe("a-b-c.astro");
		expect(normalizeFilename("   ")).toBe("index.astro");
	});
});
