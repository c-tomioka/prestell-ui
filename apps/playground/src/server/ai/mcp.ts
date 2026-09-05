// Astro Docs MCP Server client (https://mcp.docs.astro.build/mcp).
//
// The server is a stateless Streamable HTTP endpoint with a single tool,
// `search_astro_docs({ query })`, and no CORS headers — so it is always reached
// from the Worker, never from the browser. Two usage modes:
//   - "tools":  hand the MCP tools to `streamText` (models with tool calling)
//   - "inject": search once up front and paste excerpts into the system prompt
//               (fallback for local models with weak/no tool calling)
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { type AiEnv, DEFAULT_ASTRO_DOCS_MCP_URL, readEnv } from "./providers";

export const DOCS_TOOL_NAME = "search_astro_docs";

export function docsMcpUrl(env: AiEnv): string {
	return readEnv(env, "ASTRO_DOCS_MCP_URL") ?? DEFAULT_ASTRO_DOCS_MCP_URL;
}

export function connectDocsMcp(env: AiEnv): Promise<MCPClient> {
	return createMCPClient({
		name: "prestell-playground",
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

export interface DocsSearchHit {
	title: string;
	url: string;
	content: string;
}

export type DocsSearchResult =
	| { ok: true; hits: DocsSearchHit[] }
	| { ok: false; error: string };

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
}

/** Run `search_astro_docs` once and normalise the result. Never throws. */
export async function searchAstroDocs(
	env: AiEnv,
	query: string,
	options: DocsSearchOptions = {},
): Promise<DocsSearchResult> {
	const { maxHits = 5, maxCharsPerHit = 1500, timeoutMs = 10_000 } = options;
	let client: MCPClient | undefined;
	try {
		client = await connectDocsMcp(env);
		const result = await client.callTool({
			name: DOCS_TOOL_NAME,
			arguments: { query },
			options: { timeout: timeoutMs },
		});
		const content = (result as { content?: unknown }).content;
		const text = (Array.isArray(content) ? (content as unknown[]) : [])
			.map((part) =>
				part &&
				typeof part === "object" &&
				"text" in part &&
				typeof (part as { text: unknown }).text === "string"
					? (part as { text: string }).text
					: "",
			)
			.join("\n");
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
	} finally {
		await client?.close().catch(() => {});
	}
}

/** Render search hits as a block for the system prompt. */
export function formatDocsContext(hits: DocsSearchHit[]): string {
	return hits
		.map(
			(hit, index) =>
				`### [${index + 1}] ${hit.title}${hit.url ? ` (${hit.url})` : ""}\n${hit.content}`,
		)
		.join("\n\n");
}
