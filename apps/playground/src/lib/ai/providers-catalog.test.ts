import { describe, expect, it } from "vitest";
import {
	gatewayModelId,
	isDirectProvider,
	PROVIDER_IDS,
	providerModelId,
} from "./providers-catalog";

describe("providerModelId (direct mode spelling)", () => {
	it("hyphenates Anthropic versions and strips a vendor prefix", () => {
		expect(providerModelId("anthropic", "claude-sonnet-4.5")).toBe(
			"claude-sonnet-4-5",
		);
		expect(providerModelId("anthropic", "anthropic/claude-haiku-4.5")).toBe(
			"claude-haiku-4-5",
		);
		expect(providerModelId("anthropic", "claude-sonnet-4-5")).toBe(
			"claude-sonnet-4-5",
		);
		expect(providerModelId("anthropic", "claude-opus-5")).toBe("claude-opus-5");
	});

	it("leaves OpenAI and Google ids alone apart from the prefix", () => {
		expect(providerModelId("openai", "gpt-5.2")).toBe("gpt-5.2");
		expect(providerModelId("openai", "openai/gpt-5-mini")).toBe("gpt-5-mini");
		expect(providerModelId("google", " gemini-2.5-flash ")).toBe(
			"gemini-2.5-flash",
		);
	});

	it("round-trips with the gateway spelling", () => {
		const direct = providerModelId("anthropic", "claude-sonnet-4.5");
		expect(gatewayModelId("anthropic", direct, "rest")).toBe(
			"anthropic/claude-sonnet-4.5",
		);
	});
});

describe("isDirectProvider", () => {
	it("excludes only Workers AI (no CORS on AI Gateway)", () => {
		expect(PROVIDER_IDS.filter((id) => !isDirectProvider(id))).toEqual([
			"workers-ai",
		]);
	});
});
