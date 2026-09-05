// POST /api/mcp-proxy { query } → { ok, hits | error }
//
// Thin server-side bridge to the Astro Docs MCP server (which has no CORS).
// Used by the chat panel's manual docs search and by `docsMode: "inject"`.
import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { z } from "zod";
import { searchAstroDocs } from "../../server/ai/mcp";
import type { AiEnv } from "../../server/ai/providers";
import { errorResponse, readJsonBody } from "../../server/ai/validate";

export const prerender = false;

const aiEnv = env as unknown as AiEnv;

const searchSchema = z.object({
	query: z.string().trim().min(1).max(500),
	maxHits: z.number().int().min(1).max(10).optional(),
});

export const POST: APIRoute = async ({ request }) => {
	const body = await readJsonBody(request);
	if (!body.ok) return errorResponse(body.error, body.status);
	const parsed = searchSchema.safeParse(body.value);
	if (!parsed.success)
		return errorResponse("Invalid search request: query is required.", 400);

	const result = await searchAstroDocs(aiEnv, parsed.data.query, {
		maxHits: parsed.data.maxHits,
	});
	return Response.json(result, {
		status: result.ok ? 200 : 502,
		headers: { "Cache-Control": "no-store" },
	});
};
