import { describe, expect, it, vi } from "vitest";
import type { DocsSearchResult } from "../src/lib/ai/docs";
import { handleRequest, originAllowed, type RelayEnv } from "./handler";

const HITS: DocsSearchResult = {
	ok: true,
	hits: [{ title: "Slots", url: "https://docs.astro.build/s", content: "…" }],
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
	return new Request("https://relay.test/search", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

const search = vi.fn(async () => HITS);
const env: RelayEnv = {
	ALLOWED_ORIGINS: "https://app.test, https://other.test",
};

describe("originAllowed", () => {
	it("treats an empty list or * as open and matches case-insensitively", () => {
		expect(originAllowed("https://x.test", undefined)).toBe(true);
		expect(originAllowed("https://x.test", "*")).toBe(true);
		expect(originAllowed("https://APP.test/", "https://app.test")).toBe(true);
		expect(originAllowed("https://evil.test", "https://app.test")).toBe(false);
		expect(originAllowed(null, "https://app.test")).toBe(true);
	});
});

describe("handleRequest", () => {
	it("answers preflight with CORS headers for an allowed origin", async () => {
		const response = await handleRequest(
			new Request("https://relay.test/search", {
				method: "OPTIONS",
				headers: { origin: "https://app.test" },
			}),
			env,
			{ search },
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe(
			"https://app.test",
		);
		expect(response.headers.get("access-control-allow-methods")).toContain(
			"POST",
		);
	});

	it("rejects other origins", async () => {
		const response = await handleRequest(
			post({ query: "x" }, { origin: "https://evil.test" }),
			env,
			{
				search,
			},
		);
		expect(response.status).toBe(403);
		expect(response.headers.get("access-control-allow-origin")).toBeNull();
	});

	it("relays a search with the /api/mcp-proxy contract", async () => {
		search.mockClear();
		const response = await handleRequest(
			post({ query: "slots", maxHits: 2 }, { origin: "https://app.test" }),
			env,
			{
				search,
			},
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("access-control-allow-origin")).toBe(
			"https://app.test",
		);
		expect(await response.json()).toEqual(HITS);
		expect(search).toHaveBeenCalledWith(
			{ ASTRO_DOCS_MCP_URL: undefined },
			"slots",
			{ maxHits: 2 },
		);
	});

	it("returns 502 with the error when the docs server fails", async () => {
		const failing = vi.fn(
			async (): Promise<DocsSearchResult> => ({
				ok: false,
				error: "kapa down",
			}),
		);
		const response = await handleRequest(post({ query: "x" }), env, {
			search: failing,
		});
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ ok: false, error: "kapa down" });
	});

	it("validates the body", async () => {
		expect(
			(await handleRequest(post({ query: "" }), env, { search })).status,
		).toBe(400);
		expect(
			(await handleRequest(post({ query: "x", maxHits: 99 }), env, { search }))
				.status,
		).toBe(400);
		const notJson = new Request("https://relay.test/search", {
			method: "POST",
			body: "x",
		});
		expect((await handleRequest(notJson, env, { search })).status).toBe(415);
	});

	it("applies the rate limit per client ip", async () => {
		const limit = vi.fn(async ({ key }: { key: string }) => ({
			success: key !== "1.2.3.4",
		}));
		const limited: RelayEnv = { ...env, SEARCH_LIMIT: { limit } };
		const blocked = await handleRequest(
			post({ query: "x" }, { "cf-connecting-ip": "1.2.3.4" }),
			limited,
			{
				search,
			},
		);
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get("retry-after")).toBe("60");
		expect(((await blocked.json()) as { ok: boolean }).ok).toBe(false);
		const fine = await handleRequest(
			post({ query: "x" }, { "cf-connecting-ip": "5.6.7.8" }),
			limited,
			{
				search,
			},
		);
		expect(fine.status).toBe(200);
		expect(limit).toHaveBeenCalledWith({ key: "1.2.3.4" });
	});

	it("serves /health and refuses other paths and methods", async () => {
		expect(
			(
				await handleRequest(new Request("https://relay.test/health"), env, {
					search,
				})
			).status,
		).toBe(200);
		expect(
			(
				await handleRequest(new Request("https://relay.test/nope"), env, {
					search,
				})
			).status,
		).toBe(404);
		const get = await handleRequest(
			new Request("https://relay.test/search"),
			env,
			{ search },
		);
		expect(get.status).toBe(405);
		expect(get.headers.get("allow")).toBe("POST, OPTIONS");
	});
});
