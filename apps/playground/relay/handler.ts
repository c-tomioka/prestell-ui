// Astro docs relay for the static-host version (Phase 4).
//
// The Astro Docs MCP server sends no CORS headers, so a browser cannot search
// it directly. This Worker exposes the same contract as `/api/mcp-proxy`
// (`POST { query, maxHits } → DocsSearchResult`) with CORS for the front end,
// a per-IP rate limit, and nothing else: no Worker Loader, no secrets, so it
// runs on Workers Free. The handler is a pure function so it can be unit-tested
// with plain `Request` objects.
import type { DocsSearchResult } from "../src/lib/ai/docs";
import { searchAstroDocs } from "../src/server/ai/mcp";
import type { AiEnv } from "../src/server/ai/providers";
import { docsSearchSchema, readJsonBody } from "../src/server/ai/validate";

/** Cloudflare Rate Limiting binding (declared locally; no runtime types needed). */
export interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RelayEnv {
	/** Defaults to the public Astro Docs MCP endpoint. */
	ASTRO_DOCS_MCP_URL?: string;
	/** Comma-separated page origins allowed to call the relay; empty or `*` = any. */
	ALLOWED_ORIGINS?: string;
	/** Optional per-client rate limit (see wrangler.jsonc). */
	SEARCH_LIMIT?: RateLimiter;
}

export interface RelayDeps {
	/** Injectable search (tests). Default: `searchAstroDocs`. */
	search: (
		env: AiEnv,
		query: string,
		options: { maxHits?: number },
	) => Promise<DocsSearchResult>;
}

const defaultDeps: RelayDeps = {
	search: (env, query, options) => searchAstroDocs(env, query, options),
};

const NO_STORE = "no-store";
const RATE_LIMITED_MESSAGE =
	"The docs relay is rate limiting this client; try again in a minute.";

function normaliseOrigin(origin: string): string {
	return origin.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Whether `origin` may call the relay. Missing Origin (curl, server-side)
 * passes; the allowlist only governs which pages a browser may embed us in.
 */
export function originAllowed(
	origin: string | null,
	allowed: string | undefined,
): boolean {
	if (origin === null) return true;
	const list = (allowed ?? "").split(",").map(normaliseOrigin).filter(Boolean);
	if (list.length === 0 || list.includes("*")) return true;
	return list.includes(normaliseOrigin(origin));
}

function corsHeaders(origin: string | null): Record<string, string> {
	if (origin === null) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "content-type",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}

function json(
	body: unknown,
	status: number,
	headers: Record<string, string>,
): Response {
	return Response.json(body, {
		status,
		headers: { "Cache-Control": NO_STORE, ...headers },
	});
}

function clientKey(request: Request): string {
	return (
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown"
	);
}

export async function handleRequest(
	request: Request,
	env: RelayEnv,
	deps: Partial<RelayDeps> = {},
): Promise<Response> {
	const { search } = { ...defaultDeps, ...deps };
	const origin = request.headers.get("origin");
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/+$/, "") || "/";

	if (!originAllowed(origin, env.ALLOWED_ORIGINS)) {
		return json({ ok: false, error: "Origin not allowed." }, 403, {});
	}
	const cors = corsHeaders(origin);

	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: cors });
	}
	if (request.method === "GET" && path === "/health") {
		return json({ ok: true }, 200, cors);
	}
	if (path !== "/" && path !== "/search") {
		return json({ ok: false, error: "Not found." }, 404, cors);
	}
	if (request.method !== "POST") {
		return json({ ok: false, error: "Use POST." }, 405, {
			...cors,
			Allow: "POST, OPTIONS",
		});
	}

	if (env.SEARCH_LIMIT) {
		const { success } = await env.SEARCH_LIMIT.limit({
			key: clientKey(request),
		});
		if (!success) {
			return json({ ok: false, error: RATE_LIMITED_MESSAGE }, 429, {
				...cors,
				"Retry-After": "60",
			});
		}
	}

	const body = await readJsonBody(request);
	if (!body.ok)
		return json({ ok: false, error: body.error }, body.status, cors);
	const parsed = docsSearchSchema.safeParse(body.value);
	if (!parsed.success) {
		return json(
			{ ok: false, error: "Invalid search request: query is required." },
			400,
			cors,
		);
	}

	const result = await search(
		{ ASTRO_DOCS_MCP_URL: env.ASTRO_DOCS_MCP_URL },
		parsed.data.query,
		{ maxHits: parsed.data.maxHits },
	);
	return json(result, result.ok ? 200 : 502, cors);
}
