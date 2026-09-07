import type { UIMessage, UIMessageChunk } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { describeChatError } from "../errors";
import { DirectChatTransport, type DirectRequest } from "./transport";

const ORIGIN = "http://localhost:4321";

function textModel(text: string) {
	return new MockLanguageModelV3({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: "stream-start", warnings: [] },
					{ type: "text-start", id: "t" },
					{ type: "text-delta", id: "t", delta: text },
					{ type: "text-end", id: "t" },
					{
						type: "finish",
						finishReason: { unified: "stop", raw: undefined },
						usage: {
							inputTokens: {
								total: 1,
								noCache: 1,
								cacheRead: undefined,
								cacheWrite: undefined,
							},
							outputTokens: { total: 1, text: 1, reasoning: undefined },
						},
					},
				] as never[],
			}),
		}),
	});
}

async function collect(
	stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> {
	const chunks: UIMessageChunk[] = [];
	const reader = stream.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return chunks;
		chunks.push(value);
	}
}

const user: UIMessage = {
	id: "u1",
	role: "user",
	parts: [{ type: "text", text: "Make a hero section" }],
};

function request(overrides: Partial<DirectRequest> = {}): DirectRequest {
	return {
		provider: "ollama",
		model: "qwen2.5-coder:7b",
		docsMode: "off",
		filename: "index.astro",
		source: "<h1>Hi</h1>",
		baseUrl: "http://localhost:11434/v1",
		...overrides,
	};
}

describe("DirectChatTransport", () => {
	it("streams the model reply as a UI message stream", async () => {
		const model = textModel("Hello from the browser");
		const transport = new DirectChatTransport(() => request(), {
			createModel: () => model,
			origin: () => ORIGIN,
		});
		const chunks = await collect(
			await transport.sendMessages({
				trigger: "submit-message",
				chatId: "c",
				messageId: undefined,
				messages: [user],
				abortSignal: undefined,
			}),
		);
		const text = chunks
			.filter(
				(c): c is Extract<UIMessageChunk, { type: "text-delta" }> =>
					c.type === "text-delta",
			)
			.map((c) => c.delta)
			.join("");
		expect(text).toBe("Hello from the browser");
		// The system prompt carries the editor contents, like /api/chat.
		const call = model.doStreamCalls[0];
		const system = call.prompt.find((m) => m.role === "system");
		expect(
			system && "content" in system ? String(system.content) : "",
		).toContain("<h1>Hi</h1>");
	});

	it("injects docs excerpts and writes a notice when the relay fails", async () => {
		const model = textModel("ok");
		const searchDocs = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				hits: [{ title: "Slots", url: "", content: "Use <slot />" }],
			})
			.mockResolvedValueOnce({ ok: false, error: "relay down" });
		const transport = new DirectChatTransport(
			() => request({ docsMode: "inject" }),
			{
				createModel: () => model,
				searchDocs,
				origin: () => ORIGIN,
			},
		);
		const send = () =>
			transport.sendMessages({
				trigger: "submit-message",
				chatId: "c",
				messageId: undefined,
				messages: [user],
				abortSignal: undefined,
			});
		await collect(await send());
		const system = model.doStreamCalls[0].prompt.find(
			(m) => m.role === "system",
		);
		expect(
			String(system && "content" in system ? system.content : ""),
		).toContain("Use <slot />");
		expect(searchDocs).toHaveBeenCalledWith(
			"Make a hero section",
			expect.objectContaining({ maxHits: 4 }),
		);

		const chunks = await collect(await send());
		const notice = chunks.find((c) => c.type === "data-notice") as
			| { data: { kind: string; message: string } }
			| undefined;
		expect(notice?.data.kind).toBe("docs-unavailable");
		expect(notice?.data.message).toContain("relay down");
	});

	it("hands the search tool to the model in tools mode", async () => {
		const model = textModel("ok");
		const transport = new DirectChatTransport(
			() => request({ docsMode: "tools" }),
			{
				createModel: () => model,
				origin: () => ORIGIN,
			},
		);
		await collect(
			await transport.sendMessages({
				trigger: "submit-message",
				chatId: "c",
				messageId: undefined,
				messages: [user],
				abortSignal: undefined,
			}),
		);
		const tools = model.doStreamCalls[0].tools ?? [];
		expect(tools.map((t) => t.name)).toEqual(["search_astro_docs"]);
	});

	it("rejects with a coded error when the model cannot be built", async () => {
		const transport = new DirectChatTransport(
			() =>
				request({
					provider: "anthropic",
					model: "claude-sonnet-4.5",
					apiKey: undefined,
				}),
			{ origin: () => ORIGIN },
		);
		await expect(
			transport
				.sendMessages({
					trigger: "submit-message",
					chatId: "c",
					messageId: undefined,
					messages: [user],
					abortSignal: undefined,
				})
				.catch((error: Error) => describeChatError(error).message),
		).resolves.toContain("No API key for Anthropic");
	});

	it("turns stream failures into coded error chunks", async () => {
		const model = new MockLanguageModelV3({
			doStream: async () => {
				throw Object.assign(new Error("Unauthorized"), {
					name: "AI_APICallError",
					statusCode: 401,
					url: "https://api.openai.com",
					isRetryable: false,
				});
			},
		});
		const transport = new DirectChatTransport(
			() => request({ provider: "openai", model: "gpt-5.2", apiKey: "bad" }),
			{ createModel: () => model, origin: () => ORIGIN },
		);
		const chunks = await collect(
			await transport.sendMessages({
				trigger: "submit-message",
				chatId: "c",
				messageId: undefined,
				messages: [user],
				abortSignal: undefined,
			}),
		);
		const error = chunks.find((c) => c.type === "error") as
			| { errorText: string }
			| undefined;
		expect(error).toBeDefined();
		const info = describeChatError(error?.errorText ?? "");
		expect(info.kind).toBe("request");
		expect(info.message).toBe(
			"OpenAI rejected the API key (HTTP 401). Check the key, then retry.",
		);
	});
});
