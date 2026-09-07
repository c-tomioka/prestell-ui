// POST /api/chat — streams an assistant reply for the chat panel.
//
// Body: { messages: UIMessage[], provider, model, docsMode, filename, source }
// Response: AI SDK UI message stream (SSE), consumed by `@ai-sdk/svelte`.
import { env } from "cloudflare:workers";
import type { MCPClient } from "@ai-sdk/mcp";
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	stepCountIs,
	streamText,
	type ToolSet,
	type UIMessage,
} from "ai";
import type { APIRoute } from "astro";
import {
	DOCS_TOOL_NOTE,
	docsUnavailableNotice,
	formatDocsContext,
} from "../../lib/ai/docs";
import { type CodedError, encodeCodedError } from "../../lib/ai/error-codes";
import type { ChatNotice } from "../../lib/ai/types";
import { connectDocsMcp, searchAstroDocs } from "../../server/ai/mcp";
import { buildSystemPrompt } from "../../server/ai/prompt";
import {
	type AiEnv,
	isLocalProvider,
	localBaseUrl,
	type ProviderId,
	resolveModel,
} from "../../server/ai/providers";
import {
	LLM_CHUNK_TIMEOUT_MS,
	LLM_FIRST_CHUNK_TIMEOUT_MS,
	LLM_MAX_OUTPUT_TOKENS,
	LLM_MAX_RETRIES,
	LLM_MAX_STEPS,
	MCP_RETRIES,
	MCP_RETRY_DELAY_MS,
	withRetry,
} from "../../server/ai/resilience";
import {
	chatRequestSchema,
	errorResponse,
	readJsonBody,
} from "../../server/ai/validate";

export const prerender = false;

const aiEnv = env as unknown as AiEnv;

/**
 * Turn transport-level failures into something the chat panel can show.
 * Known situations become a `CodedError` (text is composed on the client);
 * anything else passes through as the raw message.
 */
function describeError(
	error: unknown,
	provider: ProviderId,
): CodedError | string {
	const message = error instanceof Error ? error.message : String(error);
	if (
		isLocalProvider(provider) &&
		/fetch failed|ECONNREFUSED|Network connection lost|connect/i.test(message)
	) {
		return {
			code: "local-unreachable",
			provider,
			base: localBaseUrl(aiEnv, provider),
		};
	}
	if (
		(error instanceof Error && error.name === "TimeoutError") ||
		/timed out|timeout/i.test(message)
	) {
		return { code: "timeout", detail: message };
	}
	return message;
}

/** The AI SDK error part only carries a string. */
function errorText(error: unknown, provider: ProviderId): string {
	const described = describeError(error, provider);
	return typeof described === "string"
		? described
		: encodeCodedError(described);
}

function lastUserText(messages: UIMessage[]): string {
	const last = [...messages]
		.reverse()
		.find((message) => message.role === "user");
	if (!last) return "";
	return last.parts
		.map((part) => (part.type === "text" ? part.text : ""))
		.join(" ")
		.trim();
}

export const POST: APIRoute = async ({ request }) => {
	const body = await readJsonBody(request);
	if (!body.ok) return errorResponse(body.error, body.status);

	const parsed = chatRequestSchema.safeParse(body.value);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return errorResponse(
			`Invalid chat request: ${issue ? `${issue.path.join(".")} ${issue.message}` : "unknown"}`,
			400,
		);
	}
	const { provider, model, docsMode, filename, source } = parsed.data;
	const messages = parsed.data.messages as UIMessage[];

	let languageModel: ReturnType<typeof resolveModel>;
	try {
		languageModel = resolveModel(aiEnv, provider, model);
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : String(error),
			400,
		);
	}

	// --- Astro docs (graceful degradation: any failure just drops the docs) ---
	let docsContext: string | undefined;
	let tools: ToolSet | undefined;
	let mcp: MCPClient | undefined;
	let docsNote: string | undefined;
	/** Streamed to the panel when docs were requested but could not be used. */
	let notice: ChatNotice | undefined;

	if (docsMode === "inject") {
		const query = lastUserText(messages).slice(0, 300);
		if (query) {
			// searchAstroDocs retries once internally and never throws.
			const result = await searchAstroDocs(aiEnv, query, { maxHits: 4 });
			if (result.ok && result.hits.length > 0)
				docsContext = formatDocsContext(result.hits);
			else if (!result.ok) {
				console.warn("[chat] docs search failed:", result.error);
				notice = docsUnavailableNotice(result.error);
			}
		}
	} else if (docsMode === "tools") {
		try {
			mcp = await withRetry(() => connectDocsMcp(aiEnv), {
				attempts: MCP_RETRIES + 1,
				delayMs: MCP_RETRY_DELAY_MS,
			});
			tools = (await mcp.tools()) as ToolSet;
			docsNote = DOCS_TOOL_NOTE;
		} catch (error) {
			console.warn("[chat] docs MCP unavailable:", error);
			await mcp?.close().catch(() => {});
			mcp = undefined;
			tools = undefined;
			notice = docsUnavailableNotice(
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	const system = [
		buildSystemPrompt({ filename, source, docsContext }),
		docsNote,
	]
		.filter(Boolean)
		.join("\n\n");

	const closeMcp = async () => {
		await mcp?.close().catch(() => {});
		mcp = undefined;
	};

	try {
		const result = streamText({
			model: languageModel,
			system,
			messages: await convertToModelMessages(messages),
			tools,
			stopWhen: stepCountIs(LLM_MAX_STEPS),
			maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
			abortSignal: request.signal,
			// Pre-stream failures are retried by the SDK; a silent stream is cut off
			// so the panel can offer Retry instead of hanging.
			maxRetries: LLM_MAX_RETRIES,
			timeout: {
				firstChunkMs: LLM_FIRST_CHUNK_TIMEOUT_MS,
				chunkMs: LLM_CHUNK_TIMEOUT_MS,
			},
			onFinish: closeMcp,
			onError: closeMcp,
		});

		const onError = (error: unknown) => errorText(error, provider);
		const stream = createUIMessageStream({
			execute: ({ writer }) => {
				// Persisted as a `data-notice` part so the degradation stays visible.
				if (notice) writer.write({ type: "data-notice", data: notice });
				writer.merge(result.toUIMessageStream({ onError }));
			},
			onError,
		});
		return createUIMessageStreamResponse({
			stream,
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error) {
		await closeMcp();
		return errorResponse(describeError(error, provider), 500);
	}
};
