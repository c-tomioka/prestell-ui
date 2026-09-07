// Astro Docs MCP Server client (https://mcp.docs.astro.build/mcp).
//
// The server is a stateless Streamable HTTP endpoint with a single tool,
// `search_astro_docs({ query })`, and no CORS headers — so it is always reached
// from the Worker, never from the browser. Two usage modes:
//   - "tools":  hand the MCP tools to `streamText` (models with tool calling)
//   - "inject": search once up front and paste excerpts into the system prompt
//               (fallback for local models with weak/no tool calling)
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import {
	DOCS_TOOL_NAME,
	type DocsSearchHit,
	type DocsSearchResult,
} from "../../lib/ai/docs";
import { type AiEnv, DEFAULT_ASTRO_DOCS_MCP_URL, readEnv } from "./providers";
import {
	MCP_CONNECT_TIMEOUT_MS,
	MCP_RETRIES,
	MCP_RETRY_DELAY_MS,
	MCP_TOOL_TIMEOUT_MS,
	withRetry,
} from "./resilience";

// Result types and `formatDocsContext` are shared with the browser (`src/lib/ai/docs.ts`).
export {
	DOCS_TOOL_NAME,
	type DocsSearchHit,
	type DocsSearchResult,
	formatDocsContext,
} from "../../lib/ai/docs";

export function docsMcpUrl(env: AiEnv): string {
	return readEnv(env, "ASTRO_DOCS_MCP_URL") ?? DEFAULT_ASTRO_DOCS_MCP_URL;
}

export interface ConnectOptions {
	/** Bound on transport start + the initialize handshake. */
	timeoutMs?: number;
}

export function connectDocsMcp(
	env: AiEnv,
	options: ConnectOptions = {},
): Promise<MCPClient> {
	return createMCPClient({
		name: "prestell-playground",
		// An unreachable docs host must not stall the whole chat request.
		initializationOptions: {
			timeout: options.timeoutMs ?? MCP_CONNECT_TIMEOUT_MS,
		},
		// Transient tools/call failures (JSON-RPC application errors are not retried).
		maxRetries: MCP_RETRIES,
		transport: {
			type: "http",
			url: docsMcpUrl(env),
			// workerd rejects `fetch` called with a foreign `this`; the SDK stores
			// `globalThis.fetch` unbound, so hand it a wrapper instead.
			fetch: (input, init) => fetch(input, init),
			// workerd only supports "follow" | "manual"; the SDK default is "error".
			redirect: "follow",
		},
	});
}

interface KapaSearchPayload {
	search_results?: Array<{
		title?: unknown;
		source_url?: unknown;
		content?: unknown;
	}>;
	error?: unknown;
}

export interface DocsSearchOptions {
	maxHits?: number;
	maxCharsPerHit?: number;
	timeoutMs?: number;
	/** Injectable connection factory (tests). Default: `connectDocsMcp(env)`. */
	connect?: () => Promise<MCPClient>;
	/** Injectable retry sleep (tests). */
	sleep?: (ms: number) => Promise<void>;
}

/** Text content of a tool result, joined. */
function toolResultText(result: unknown): string {
	const content = (result as { content?: unknown }).content;
	return (Array.isArray(content) ? (content as unknown[]) : [])
		.map((part) =>
			part &&
			typeof part === "object" &&
			"text" in part &&
			typeof (part as { text: unknown }).text === "string"
				? (part as { text: string }).text
				: "",
		)
		.join("\n");
}

/**
 * Run `search_astro_docs` and normalise the result. Connection or call
 * failures are retried once (`MCP_RETRIES`); a malformed payload is not.
 * Never throws.
 */
export async function searchAstroDocs(
	env: AiEnv,
	query: string,
	options: DocsSearchOptions = {},
): Promise<DocsSearchResult> {
	const {
		maxHits = 5,
		maxCharsPerHit = 1500,
		timeoutMs = MCP_TOOL_TIMEOUT_MS,
		connect = () => connectDocsMcp(env),
		sleep,
	} = options;
	try {
		const text = await withRetry(
			async () => {
				let client: MCPClient | undefined;
				try {
					client = await connect();
					const result = await client.callTool({
						name: DOCS_TOOL_NAME,
						arguments: { query },
						options: { timeout: timeoutMs },
					});
					return toolResultText(result);
				} finally {
					await client?.close().catch(() => {});
				}
			},
			{ attempts: MCP_RETRIES + 1, delayMs: MCP_RETRY_DELAY_MS, sleep },
		);
		let payload: KapaSearchPayload;
		try {
			payload = JSON.parse(text) as KapaSearchPayload;
		} catch {
			return {
				ok: false,
				error: "The docs server returned a non-JSON payload.",
			};
		}
		if (typeof payload.error === "string")
			return { ok: false, error: payload.error };
		const hits = (payload.search_results ?? [])
			.map<DocsSearchHit | null>((hit) =>
				typeof hit.content === "string"
					? {
							title: typeof hit.title === "string" ? hit.title : "Astro Docs",
							url: typeof hit.source_url === "string" ? hit.source_url : "",
							content:
								hit.content.length > maxCharsPerHit
									? `${hit.content.slice(0, maxCharsPerHit)}…`
									: hit.content,
						}
					: null,
			)
			.filter((hit): hit is DocsSearchHit => hit !== null)
			.slice(0, maxHits);
		return { ok: true, hits };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
