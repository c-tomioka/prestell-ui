// POST /api/chat — streams an assistant reply for the chat panel.
//
// Body: { messages: UIMessage[], provider, model, docsMode, filename, source }
// Response: AI SDK UI message stream (SSE), consumed by `@ai-sdk/svelte`.
import { env } from "cloudflare:workers";
import type { MCPClient } from "@ai-sdk/mcp";
import {
	convertToModelMessages,
	stepCountIs,
	streamText,
	type ToolSet,
	type UIMessage,
} from "ai";
import type { APIRoute } from "astro";
import {
	connectDocsMcp,
	formatDocsContext,
	searchAstroDocs,
} from "../../server/ai/mcp";
import { buildSystemPrompt } from "../../server/ai/prompt";
import {
	type AiEnv,
	isLocalProvider,
	localBaseUrl,
	type ProviderId,
	resolveModel,
} from "../../server/ai/providers";
import {
	chatRequestSchema,
	errorResponse,
	readJsonBody,
} from "../../server/ai/validate";

export const prerender = false;

const aiEnv = env as unknown as AiEnv;

/** Max tool-calling rounds per reply (search → answer). */
const MAX_STEPS = 5;

/** Turn transport-level failures into something the chat panel can show. */
function describeError(error: unknown, provider: ProviderId): string {
	const message = error instanceof Error ? error.message : String(error);
	if (
		isLocalProvider(provider) &&
		/fetch failed|ECONNREFUSED|Network connection lost|connect/i.test(message)
	) {
		const base = localBaseUrl(aiEnv, provider);
		return provider === "ollama"
			? `Ollama に接続できません (${base})。\`ollama serve\` を実行してから再試行してください。`
			: `LM Studio に接続できません (${base})。LM Studio の Developer タブで Start Server を押してから再試行してください。`;
	}
	return message;
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

	if (docsMode === "inject") {
		const query = lastUserText(messages).slice(0, 300);
		if (query) {
			const result = await searchAstroDocs(aiEnv, query, { maxHits: 4 });
			if (result.ok && result.hits.length > 0)
				docsContext = formatDocsContext(result.hits);
			else if (!result.ok)
				console.warn("[chat] docs search failed:", result.error);
		}
	} else if (docsMode === "tools") {
		try {
			mcp = await connectDocsMcp(aiEnv);
			tools = (await mcp.tools()) as ToolSet;
			docsNote =
				"You can call `search_astro_docs` to look up current Astro syntax, APIs, and best practices before answering. Search when you are not certain.";
		} catch (error) {
			console.warn("[chat] docs MCP unavailable:", error);
			await mcp?.close().catch(() => {});
			mcp = undefined;
			tools = undefined;
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
			stopWhen: stepCountIs(MAX_STEPS),
			abortSignal: request.signal,
			onFinish: closeMcp,
			onError: closeMcp,
		});

		return result.toUIMessageStreamResponse({
			headers: { "Cache-Control": "no-store" },
			onError: (error) => describeError(error, provider),
		});
	} catch (error) {
		await closeMcp();
		return errorResponse(describeError(error, provider), 500);
	}
};
