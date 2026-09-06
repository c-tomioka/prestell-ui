import type { MCPClient } from "@ai-sdk/mcp";
import { describe, expect, it } from "vitest";
import { searchAstroDocs } from "./mcp";

function fakeClient(payload: unknown): MCPClient {
	return {
		callTool: async () => ({
			content: [{ type: "text", text: JSON.stringify(payload) }],
		}),
		close: async () => {},
	} as unknown as MCPClient;
}

const hits = {
	search_results: [
		{
			title: "Components",
			source_url: "https://docs.astro.build/c",
			content: "Astro components…",
		},
	],
};

describe("searchAstroDocs", () => {
	it("retries once when the first connection fails", async () => {
		let attempts = 0;
		const slept: number[] = [];
		const result = await searchAstroDocs({}, "components", {
			connect: async () => {
				attempts++;
				if (attempts === 1) throw new Error("ECONNREFUSED");
				return fakeClient(hits);
			},
			sleep: async (ms) => void slept.push(ms),
		});
		expect(result).toEqual({
			ok: true,
			hits: [
				{
					title: "Components",
					url: "https://docs.astro.build/c",
					content: "Astro components…",
				},
			],
		});
		expect(attempts).toBe(2);
		expect(slept).toHaveLength(1);
	});

	it("gives up after the retry and reports the error without throwing", async () => {
		let attempts = 0;
		const result = await searchAstroDocs({}, "components", {
			connect: async () => {
				attempts++;
				throw new Error("docs host down");
			},
			sleep: async () => {},
		});
		expect(result).toEqual({ ok: false, error: "docs host down" });
		expect(attempts).toBe(2);
	});

	it("does not retry a malformed payload", async () => {
		let attempts = 0;
		const result = await searchAstroDocs({}, "components", {
			connect: async () => {
				attempts++;
				return {
					callTool: async () => ({
						content: [{ type: "text", text: "not json" }],
					}),
					close: async () => {},
				} as unknown as MCPClient;
			},
			sleep: async () => {},
		});
		expect(result.ok).toBe(false);
		expect(attempts).toBe(1);
	});
});
