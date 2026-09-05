import { describe, expect, it } from "vitest";
import {
	type AiEnv,
	gatewayConfig,
	gatewayModelId,
	listProviders,
	sanitizingFetch,
} from "./providers";

const token = "cf-token";
const REST = "https://api.cloudflare.com/client/v4/accounts/abc/ai";

describe("gatewayConfig", () => {
	it("returns null when not configured", () => {
		expect(gatewayConfig({})).toBeNull();
		expect(gatewayConfig({ CF_AI_GATEWAY_URL: REST })).toBeNull();
	});

	it("parses the REST API URL in the forms the dashboard shows", () => {
		for (const url of [
			`${REST}/run`,
			REST,
			`${REST}/v1/chat/completions`,
			"https://api.cloudflare.com/client/v4/accounts/abc",
		]) {
			const config = gatewayConfig({
				CF_AI_GATEWAY_URL: url,
				CF_AI_GATEWAY_TOKEN: token,
				CF_AI_GATEWAY_ID: "prestell",
			});
			expect(config).toMatchObject({
				kind: "rest",
				baseURL: `${REST}/v1`,
				apiKey: token,
				headers: { "cf-aig-gateway-id": "prestell" },
			});
		}
	});

	it("routes a provider with a local key through the compat endpoint even with a REST url", () => {
		const env: AiEnv = {
			CF_AI_GATEWAY_URL: `${REST}/run`,
			CF_AI_GATEWAY_TOKEN: token,
			CF_AI_GATEWAY_ID: "prestell",
			ANTHROPIC_API_KEY: "sk-ant",
		};
		expect(gatewayConfig(env, "anthropic")).toEqual({
			kind: "compat",
			baseURL: "https://gateway.ai.cloudflare.com/v1/abc/prestell/compat",
			headers: { "cf-aig-authorization": `Bearer ${token}` },
			apiKey: "sk-ant",
			gatewayId: "prestell",
		});
		expect(gatewayConfig(env, "openai")?.kind).toBe("rest");
		expect(gatewayConfig(env, "workers-ai")?.kind).toBe("rest");
	});

	it("omits the gateway header when no gateway id is set (default gateway)", () => {
		const config = gatewayConfig({
			CF_AI_GATEWAY_URL: REST,
			CF_AI_GATEWAY_TOKEN: token,
		});
		expect(config?.headers).toEqual({});
		expect(config?.gatewayId).toBeUndefined();
	});

	it("parses the legacy compat URL and uses the provider key as Authorization", () => {
		const env: AiEnv = {
			CF_AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/abc/mygw/compat",
			CF_AI_GATEWAY_TOKEN: token,
			ANTHROPIC_API_KEY: "sk-ant",
		};
		expect(gatewayConfig(env, "anthropic")).toEqual({
			kind: "compat",
			baseURL: "https://gateway.ai.cloudflare.com/v1/abc/mygw/compat",
			headers: { "cf-aig-authorization": `Bearer ${token}` },
			apiKey: "sk-ant",
			gatewayId: "mygw",
		});
		expect(gatewayConfig(env, "workers-ai")?.apiKey).toBe(token);
		expect(gatewayConfig(env, "openai")?.apiKey).toBeUndefined();
	});

	it("rejects unknown URL shapes", () => {
		expect(() =>
			gatewayConfig({
				CF_AI_GATEWAY_URL: "https://example.com/x",
				CF_AI_GATEWAY_TOKEN: token,
			}),
		).toThrow(/CF_AI_GATEWAY_URL/);
	});
});

describe("gatewayModelId", () => {
	it("prefixes third-party models and leaves Workers AI / pre-prefixed ids alone", () => {
		expect(gatewayModelId("google", "gemini-3-flash")).toBe(
			"google/gemini-3-flash",
		);
		expect(
			gatewayModelId("workers-ai", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
		).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
		expect(gatewayModelId("openai", "openai/gpt-5.2")).toBe("openai/gpt-5.2");
	});

	it("normalises Anthropic version spelling per endpoint", () => {
		expect(gatewayModelId("anthropic", "claude-sonnet-4-5", "rest")).toBe(
			"anthropic/claude-sonnet-4.5",
		);
		expect(gatewayModelId("anthropic", "claude-sonnet-4.5", "rest")).toBe(
			"anthropic/claude-sonnet-4.5",
		);
		expect(gatewayModelId("anthropic", "claude-opus-5", "rest")).toBe(
			"anthropic/claude-opus-5",
		);
		expect(gatewayModelId("anthropic", "claude-sonnet-4.5", "compat")).toBe(
			"anthropic/claude-sonnet-4-5",
		);
		expect(
			gatewayModelId("anthropic", "claude-haiku-4-5-20251001", "compat"),
		).toBe("anthropic/claude-haiku-4-5-20251001");
		expect(
			gatewayModelId("anthropic", "anthropic/claude-sonnet-4-5", "rest"),
		).toBe("anthropic/claude-sonnet-4.5");
	});
});

describe("sanitizingFetch", () => {
	it("coerces numeric delta.content in SSE chunks to strings and leaves other lines alone", async () => {
		const sse = [
			'data: {"choices":[{"index":0,"delta":{"content":2}}]}',
			'data: {"choices":[{"index":0,"delta":{"content":" ok"}}]}',
			"data: [DONE]",
			"",
		].join("\n");
		const fetchImpl = (async () =>
			new Response(sse, {
				headers: { "content-type": "text/event-stream" },
			})) as unknown as typeof fetch;
		const text = await (
			await sanitizingFetch(fetchImpl)("https://x/", {})
		).text();
		expect(text).toContain('"content":"2"');
		expect(text).toContain('"content":" ok"');
		expect(text).toContain("data: [DONE]");
	});

	it("passes non-SSE responses through untouched", async () => {
		const fetchImpl = (async () =>
			Response.json({ ok: true })) as unknown as typeof fetch;
		expect(
			await (await sanitizingFetch(fetchImpl)("https://x/", {})).json(),
		).toEqual({ ok: true });
	});
});

describe("listProviders", () => {
	it("marks gateway providers unconfigured without env and Workers AI unconfigured without a gateway id", () => {
		const none = listProviders({});
		expect(
			none.filter((p) => p.kind === "gateway").every((p) => !p.configured),
		).toBe(true);
		const rest = listProviders({
			CF_AI_GATEWAY_URL: REST,
			CF_AI_GATEWAY_TOKEN: token,
		});
		expect(rest.find((p) => p.id === "anthropic")?.configured).toBe(true);
		expect(rest.find((p) => p.id === "workers-ai")?.configured).toBe(false);
		const withId = listProviders({
			CF_AI_GATEWAY_URL: REST,
			CF_AI_GATEWAY_TOKEN: token,
			CF_AI_GATEWAY_ID: "default",
		});
		expect(withId.find((p) => p.id === "workers-ai")?.configured).toBe(true);
	});
});
