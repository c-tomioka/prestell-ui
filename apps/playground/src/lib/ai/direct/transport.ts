// `ChatTransport` for the direct mode: runs the AI SDK in the browser and
// streams a UI message stream to `@ai-sdk/svelte`, mirroring what
// `/api/chat` does on the server (system prompt, docs handling, timeouts,
// coded errors). Nothing here talks to this app's server except the docs
// relay (`docs-proxy.ts`), which is optional.
import {
	type ChatTransport,
	convertToModelMessages,
	createUIMessageStream,
	stepCountIs,
	streamText,
	type ToolSet,
	type UIMessage,
	type UIMessageChunk,
} from "ai";
import {
	DOCS_TOOL_NAME,
	DOCS_TOOL_NOTE,
	type DocsMode,
	type DocsSearchResult,
	docsUnavailableNotice,
	formatDocsContext,
} from "../docs";
import { trimForRequest } from "../history";
import type { ProjectContext } from "../project-context";
import { buildSystemPrompt } from "../prompt";
import { isLocalProvider, type ProviderId } from "../providers-catalog";
import {
	LLM_CHUNK_TIMEOUT_MS,
	LLM_FIRST_CHUNK_TIMEOUT_MS,
	LLM_MAX_OUTPUT_TOKENS,
	LLM_MAX_RETRIES,
	LLM_MAX_STEPS,
} from "../resilience";
import type { ChatNotice } from "../types";
import { docsSearchTool, searchDocsViaProxy } from "./docs-proxy";
import { directErrorText, toDirectError } from "./errors";
import { createDirectModel } from "./models";

export interface DirectRequest {
	provider: ProviderId;
	model: string;
	docsMode: DocsMode;
	filename: string;
	source: string;
	/** Page / Site projects: the files the model may edit. */
	project?: ProjectContext;
	apiKey?: string;
	/** Local providers: where the browser reaches the server. */
	baseUrl?: string;
	/** Docs relay endpoint; default `DOCS_PROXY_URL`. */
	docsProxyUrl?: string;
}

export interface DirectTransportDeps {
	createModel: typeof createDirectModel;
	searchDocs: typeof searchDocsViaProxy;
	/** Page origin for CORS instructions (`location.origin` in the browser). */
	origin: () => string;
}

const defaultDeps: DirectTransportDeps = {
	createModel: createDirectModel,
	searchDocs: searchDocsViaProxy,
	origin: () => (typeof location === "undefined" ? "" : location.origin),
};

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

export class DirectChatTransport implements ChatTransport<UIMessage> {
	private readonly deps: DirectTransportDeps;

	constructor(
		private readonly getRequest: () => DirectRequest,
		deps: Partial<DirectTransportDeps> = {},
	) {
		this.deps = { ...defaultDeps, ...deps };
	}

	async sendMessages({
		messages,
		abortSignal,
	}: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<
		ReadableStream<UIMessageChunk>
	> {
		const request = this.getRequest();
		const context = {
			provider: request.provider,
			base: isLocalProvider(request.provider) ? request.baseUrl : undefined,
			origin: this.deps.origin(),
		};

		let model: ReturnType<typeof createDirectModel>;
		try {
			model = this.deps.createModel(request);
		} catch (error) {
			throw toDirectError(error, context);
		}

		// The full thread stays in the browser; only a window is sent.
		const window = trimForRequest(messages);

		// --- Astro docs (graceful degradation: any failure just drops the docs) ---
		let docsContext: string | undefined;
		let tools: ToolSet | undefined;
		let notice: ChatNotice | undefined;
		const proxy = { url: request.docsProxyUrl };
		if (request.docsMode === "inject") {
			const query = lastUserText(window).slice(0, 300);
			if (query) {
				const result: DocsSearchResult = await this.deps.searchDocs(query, {
					...proxy,
					maxHits: 4,
				});
				if (result.ok && result.hits.length > 0)
					docsContext = formatDocsContext(result.hits);
				else if (!result.ok) notice = docsUnavailableNotice(result.error);
			}
		} else if (request.docsMode === "tools") {
			tools = { [DOCS_TOOL_NAME]: docsSearchTool(proxy) };
		}

		const system = [
			buildSystemPrompt({
				filename: request.filename,
				source: request.source,
				project: request.project,
				docsContext,
			}),
			tools ? DOCS_TOOL_NOTE : undefined,
		]
			.filter(Boolean)
			.join("\n\n");

		const result = streamText({
			model,
			system,
			messages: await convertToModelMessages(window),
			tools,
			stopWhen: stepCountIs(LLM_MAX_STEPS),
			maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
			abortSignal,
			maxRetries: LLM_MAX_RETRIES,
			timeout: {
				firstChunkMs: LLM_FIRST_CHUNK_TIMEOUT_MS,
				chunkMs: LLM_CHUNK_TIMEOUT_MS,
			},
		});

		const onError = (error: unknown) => directErrorText(error, context);
		return createUIMessageStream({
			execute: ({ writer }) => {
				// Persisted as a `data-notice` part so the degradation stays visible.
				if (notice) writer.write({ type: "data-notice", data: notice });
				writer.merge(result.toUIMessageStream({ onError }));
			},
			onError,
		});
	}

	/** Nothing to resume: the stream lives in this page. */
	reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
		return Promise.resolve(null);
	}
}
