// Request validation for the AI endpoints.
import { z } from "zod";
import { DOCS_MODES, type DocsMode } from "../../lib/ai/docs";
import type { CodedError } from "../../lib/ai/error-codes";
import { PROVIDER_IDS } from "../../lib/ai/providers-catalog";

export const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
export const MAX_MESSAGES = 60;

// Docs modes are shared with the client (`src/lib/ai/docs.ts`).
export { DOCS_MODES, type DocsMode };

/**
 * UI messages are passed through to `convertToModelMessages`; only the
 * envelope (role + parts array) is checked here.
 */
const uiMessageSchema = z.looseObject({
	id: z.string().optional(),
	role: z.enum(["system", "user", "assistant"]),
	parts: z.array(z.looseObject({ type: z.string() })),
});

export const chatRequestSchema = z.object({
	messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES),
	provider: z.enum(PROVIDER_IDS),
	model: z.string().trim().min(1).max(200),
	docsMode: z.enum(DOCS_MODES).default("inject"),
	filename: z.string().trim().min(1).max(200).default("index.astro"),
	source: z.string().max(200_000).default(""),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Body of `/api/mcp-proxy` and the docs relay Worker (`relay/`). */
export const docsSearchSchema = z.object({
	query: z.string().trim().min(1).max(500),
	maxHits: z.number().int().min(1).max(10).optional(),
});

export type JsonBodyResult =
	| { ok: true; value: unknown }
	| { ok: false; error: string; status: number };

export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
	if (!request.headers.get("content-type")?.startsWith("application/json")) {
		return { ok: false, error: "Requests must use JSON.", status: 415 };
	}
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
		return { ok: false, error: "The request body is too large.", status: 413 };
	}
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return {
			ok: false,
			error: "The request contains invalid JSON.",
			status: 400,
		};
	}
}

/**
 * `{ ok: false, error }` with no-store headers. A `CodedError` is sent as
 * `{ ok: false, error: <code>, coded }` so the client can compose the text.
 */
export function errorResponse(
	error: string | CodedError,
	status: number,
): Response {
	const body =
		typeof error === "string"
			? { ok: false, error }
			: { ok: false, error: error.code, coded: error };
	return Response.json(body, {
		status,
		headers: { "Cache-Control": "no-store" },
	});
}
