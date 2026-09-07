import { describe, expect, it } from "vitest";
import { describeChatError } from "../errors";
import {
	createDirectModel,
	directProviders,
	listDirectLocalModels,
} from "./models";

const ORIGIN = "http://localhost:4321";

/** `LanguageModel` is a union with string ids; the direct mode always builds an object. */
function idOf(model: unknown): string {
	return (model as { modelId: string }).modelId;
}
const BASE_URLS = {
	ollama: "http://localhost:11434/v1",
	lmstudio: "http://localhost:1234/v1",
};

describe("directProviders", () => {
	it("lists local and cloud providers and marks Workers AI as server-only", () => {
		const list = directProviders({
			keys: {},
			baseUrls: BASE_URLS,
			origin: ORIGIN,
		});
		expect(list.map((p) => [p.id, p.kind, p.configured])).toEqual([
			["ollama", "local", true],
			["lmstudio", "local", true],
			["anthropic", "direct", true],
			["openai", "direct", true],
			["google", "direct", true],
			["workers-ai", "gateway", false],
		]);
		expect(list.at(-1)?.unavailable).toBe("server-only");
		expect(list[0].hint).toContain("http://localhost:11434/v1");
	});
});

describe("createDirectModel", () => {
	it("refuses Workers AI and a cloud provider without a key with coded errors", () => {
		const unsupported = (() => {
			try {
				createDirectModel({ provider: "workers-ai", model: "@cf/x" });
			} catch (error) {
				return describeChatError(error as Error);
			}
		})();
		expect(unsupported?.message).toContain("cannot be called from the browser");
		const missing = (() => {
			try {
				createDirectModel({
					provider: "anthropic",
					model: "claude-sonnet-4.5",
				});
			} catch (error) {
				return describeChatError(error as Error);
			}
		})();
		expect(missing?.kind).toBe("request");
		expect(missing?.message).toContain("No API key for Anthropic");
	});

	it("builds models for every direct provider", () => {
		expect(
			idOf(
				createDirectModel({
					provider: "ollama",
					model: "qwen2.5-coder:7b",
					baseUrl: BASE_URLS.ollama,
				}),
			),
		).toBe("qwen2.5-coder:7b");
		expect(
			idOf(
				createDirectModel({
					provider: "anthropic",
					model: "claude-sonnet-4.5",
					apiKey: "k",
				}),
			),
		).toBe("claude-sonnet-4-5");
		expect(
			idOf(
				createDirectModel({
					provider: "openai",
					model: "gpt-5.2",
					apiKey: "k",
				}),
			),
		).toBe("gpt-5.2");
		expect(
			idOf(
				createDirectModel({
					provider: "google",
					model: "gemini-2.5-flash",
					apiKey: "k",
				}),
			),
		).toBe("gemini-2.5-flash");
	});
});

describe("listDirectLocalModels", () => {
	it("lists models from the browser and reports CORS/down as direct-unreachable", async () => {
		const ok = (async () =>
			new Response(
				JSON.stringify({ data: [{ id: "b" }, { id: "a" }] }),
			)) as unknown as typeof fetch;
		expect(
			await listDirectLocalModels("ollama", BASE_URLS.ollama, ORIGIN, ok),
		).toEqual({
			ok: true,
			models: ["a", "b"],
		});
		const blocked = (async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		expect(
			await listDirectLocalModels(
				"lmstudio",
				`${BASE_URLS.lmstudio}/`,
				ORIGIN,
				blocked,
			),
		).toEqual({
			ok: false,
			coded: {
				code: "direct-unreachable",
				provider: "lmstudio",
				base: BASE_URLS.lmstudio,
				origin: ORIGIN,
			},
		});
	});
});
