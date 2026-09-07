// Astro docs search for the direct mode.
//
// The Astro Docs MCP server sends no CORS headers, so the browser reaches it
// through a small relay: `/api/mcp-proxy` on the dev server today, and a
// stand-alone Worker (next roadmap item) when the front end is served
// statically. Both accept `{ query, maxHits }` and answer `DocsSearchResult`.
import { type Tool, tool } from "ai";
import { z } from "zod";
import {
	DOCS_TOOL_NAME,
	type DocsSearchResult,
	formatDocsContext,
} from "../docs";
import { MCP_TOOL_TIMEOUT_MS } from "../resilience";

/** Relay endpoint; `PUBLIC_DOCS_PROXY_URL` overrides it at build time. */
export const DOCS_PROXY_URL: string =
	(import.meta.env?.PUBLIC_DOCS_PROXY_URL as string | undefined)?.trim() ||
	"/api/mcp-proxy";

export interface DocsProxyOptions {
	url?: string;
	maxHits?: number;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

/** Run one search through the relay. Never throws. */
export async function searchDocsViaProxy(
	query: string,
	options: DocsProxyOptions = {},
): Promise<DocsSearchResult> {
	const {
		url = DOCS_PROXY_URL,
		maxHits = 4,
		timeoutMs = MCP_TOOL_TIMEOUT_MS * 2,
		fetchImpl = fetch,
	} = options;
	try {
		const response = await fetchImpl(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ query: query.slice(0, 500), maxHits }),
			signal: AbortSignal.timeout(timeoutMs),
		});
		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			return {
				ok: false,
				error: `docs relay returned HTTP ${response.status}`,
			};
		}
		const result = payload as Partial<DocsSearchResult> & { error?: unknown };
		if (result.ok === true && Array.isArray(result.hits))
			return { ok: true, hits: result.hits };
		return {
			ok: false,
			error:
				typeof result.error === "string"
					? result.error
					: `docs relay returned HTTP ${response.status}`,
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Tool-calling equivalent of the server's MCP tool: the model asks for a
 * search and the browser runs it through the relay. Same name as the MCP tool
 * so the chat history renders both the same way.
 */
export function docsSearchTool(options: DocsProxyOptions = {}): Tool {
	return tool({
		description:
			"Search the official Astro documentation. Use it to check current Astro syntax, APIs, and best practices before answering.",
		inputSchema: z.object({
			query: z.string().describe("What to look up in the Astro docs"),
		}),
		execute: async ({ query }) => {
			const result = await searchDocsViaProxy(query, options);
			if (!result.ok) return `Docs search failed: ${result.error}`;
			return result.hits.length > 0
				? formatDocsContext(result.hits)
				: "No matching documentation found.";
		},
	});
}

export { DOCS_TOOL_NAME };
