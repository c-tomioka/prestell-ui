import { describe, expect, it } from "vitest";
import { describeChatError } from "../errors";
import {
	describeDirectError,
	directErrorText,
	providerErrorDetail,
	toDirectError,
} from "./errors";

const ORIGIN = "http://localhost:4321";

function apiError(statusCode: number, responseBody?: string) {
	return Object.assign(new Error(`HTTP ${statusCode}`), {
		name: "AI_APICallError",
		statusCode,
		responseBody,
		url: "https://example.test",
	});
}

describe("describeDirectError", () => {
	it("maps 401/403 from a cloud provider to key-rejected", () => {
		expect(
			describeDirectError(apiError(401), {
				provider: "anthropic",
				origin: ORIGIN,
			}),
		).toEqual({ code: "key-rejected", provider: "anthropic", status: 401 });
	});

	it("unwraps the AI SDK retry wrapper", () => {
		const wrapped = Object.assign(new Error("retries exhausted"), {
			name: "AI_RetryError",
			lastError: apiError(429, '{"error":{"message":"slow down"}}'),
		});
		expect(
			describeDirectError(wrapped, { provider: "openai", origin: ORIGIN }),
		).toEqual({
			code: "provider-error",
			provider: "openai",
			status: 429,
			detail: "slow down",
		});
	});

	it("treats a fetch TypeError against a local server as unreachable (CORS or down)", () => {
		const coded = describeDirectError(new TypeError("Failed to fetch"), {
			provider: "ollama",
			base: "http://localhost:11434/v1",
			origin: ORIGIN,
		});
		expect(coded).toEqual({
			code: "direct-unreachable",
			provider: "ollama",
			base: "http://localhost:11434/v1",
			origin: ORIGIN,
		});
		const info = describeChatError(
			toDirectError(new TypeError("Failed to fetch"), {
				provider: "ollama",
				base: "http://localhost:11434/v1",
				origin: ORIGIN,
			}),
		);
		expect(info.kind).toBe("local-down");
		expect(info.transient).toBe(false);
		expect(info.message).toContain("from the browser");
		expect(info.message).toContain("Localhost origins are allowed by default");
	});

	it("names the origin in the CORS instruction for non-localhost pages", () => {
		const info = describeChatError(
			directErrorText(new TypeError("Load failed"), {
				provider: "lmstudio",
				base: "http://localhost:1234/v1",
				origin: "https://prestell.example",
			}),
		);
		expect(info.message).toContain("lms server start --cors");
		const ollama = describeChatError(
			directErrorText(new TypeError("Load failed"), {
				provider: "ollama",
				base: "http://localhost:11434/v1",
				origin: "https://prestell.example",
			}),
		);
		expect(ollama.message).toContain(
			"OLLAMA_ORIGINS=https://prestell.example ollama serve",
		);
	});

	it("treats a fetch TypeError against a cloud provider as a transient network error", () => {
		const info = describeChatError(
			directErrorText(new TypeError("Failed to fetch"), {
				provider: "google",
				origin: ORIGIN,
			}),
		);
		expect(info.kind).toBe("network");
		expect(info.transient).toBe(true);
	});

	it("keeps coded errors thrown earlier (missing key) intact", () => {
		const error = toDirectError(
			new Error('{"code":"key-missing","provider":"openai"}'),
			{ provider: "openai", origin: ORIGIN },
		);
		const info = describeChatError(error);
		expect(info.kind).toBe("request");
		expect(info.message).toContain("No API key for OpenAI");
	});

	it("passes unknown messages through unchanged", () => {
		expect(
			describeDirectError(new Error("something odd"), {
				provider: "openai",
				origin: ORIGIN,
			}),
		).toBe("something odd");
	});
});

describe("providerErrorDetail", () => {
	it("prefers the provider's error message and truncates long bodies", () => {
		expect(providerErrorDetail('{"error":{"message":"model not found"}}')).toBe(
			"model not found",
		);
		expect(providerErrorDetail('{"error":"plain"}')).toBe("plain");
		expect(providerErrorDetail("x".repeat(300))).toHaveLength(201);
		expect(providerErrorDetail(undefined, "fallback")).toBe("fallback");
	});
});
