// Astro docs search results, shared by the server MCP client, the
// `/api/mcp-proxy` route, and the browser-side direct mode (which reaches the
// docs through that proxy because the MCP server has no CORS headers).
import type { ChatNotice } from "./types";

export const DOCS_TOOL_NAME = "search_astro_docs";

/** `off` = no docs; `inject` = search first, paste excerpts; `tools` = the model searches. */
export const DOCS_MODES = ["off", "inject", "tools"] as const;
export type DocsMode = (typeof DOCS_MODES)[number];

export interface DocsSearchHit {
	title: string;
	url: string;
	content: string;
}

export type DocsSearchResult =
	| { ok: true; hits: DocsSearchHit[] }
	| { ok: false; error: string };

/** Render search hits as a block for the system prompt. */
export function formatDocsContext(hits: DocsSearchHit[]): string {
	return hits
		.map(
			(hit, index) =>
				`### [${index + 1}] ${hit.title}${hit.url ? ` (${hit.url})` : ""}\n${hit.content}`,
		)
		.join("\n\n");
}

/** Instruction appended to the system prompt when the search tool is available. */
export const DOCS_TOOL_NOTE =
	"You can call `search_astro_docs` to look up current Astro syntax, APIs, and best practices before answering. Search when you are not certain.";

export function docsUnavailableNotice(reason: string): ChatNotice {
	return {
		kind: "docs-unavailable",
		message: `Astro docs unavailable (${reason}); answered without them.`,
	};
}
