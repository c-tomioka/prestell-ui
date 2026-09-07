import { describe, expect, it, vi } from "vitest";
import { docsSearchTool, searchDocsViaProxy } from "./docs-proxy";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("searchDocsViaProxy", () => {
	it("posts the query to the relay and returns the hits", async () => {
		const fetchImpl = vi.fn(
			async (_url: RequestInfo | URL, init?: RequestInit) => {
				expect(JSON.parse(String(init?.body))).toEqual({
					query: "slot",
					maxHits: 2,
				});
				return jsonResponse({
					ok: true,
					hits: [
						{ title: "Slots", url: "https://docs.astro.build/x", content: "…" },
					],
				});
			},
		);
		const result = await searchDocsViaProxy("slot", {
			url: "/api/mcp-proxy",
			maxHits: 2,
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(result).toEqual({
			ok: true,
			hits: [
				{ title: "Slots", url: "https://docs.astro.build/x", content: "…" },
			],
		});
	});

	it("reports relay failures without throwing", async () => {
		const failing = (async () =>
			jsonResponse(
				{ ok: false, error: "kapa down" },
				502,
			)) as unknown as typeof fetch;
		expect(await searchDocsViaProxy("x", { fetchImpl: failing })).toEqual({
			ok: false,
			error: "kapa down",
		});
		const missing = (async () =>
			new Response("Not found", { status: 404 })) as unknown as typeof fetch;
		expect(await searchDocsViaProxy("x", { fetchImpl: missing })).toEqual({
			ok: false,
			error: "docs relay returned HTTP 404",
		});
		const offline = (async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		expect(await searchDocsViaProxy("x", { fetchImpl: offline })).toEqual({
			ok: false,
			error: "Failed to fetch",
		});
	});
});

describe("docsSearchTool", () => {
	it("formats hits for the model and degrades to a message on failure", async () => {
		const tool = docsSearchTool({
			fetchImpl: (async () =>
				jsonResponse({
					ok: true,
					hits: [
						{
							title: "Props",
							url: "https://docs.astro.build/p",
							content: "Use Astro.props",
						},
					],
				})) as unknown as typeof fetch,
		});
		const run = tool.execute as (
			input: { query: string },
			options: unknown,
		) => Promise<string>;
		expect(await run({ query: "props" }, {})).toBe(
			"### [1] Props (https://docs.astro.build/p)\nUse Astro.props",
		);

		const empty = docsSearchTool({
			fetchImpl: (async () =>
				jsonResponse({ ok: true, hits: [] })) as unknown as typeof fetch,
		});
		expect(await (empty.execute as typeof run)({ query: "zzz" }, {})).toBe(
			"No matching documentation found.",
		);
	});
});
