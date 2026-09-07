// GET /api/models            → { providers: ProviderInfo[] }
// GET /api/models?provider=x → { ok: true, models: string[] } | { ok: false, error, code, provider }
import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import {
	type AiEnv,
	isLocalProvider,
	isProviderId,
	listLocalModels,
	listProviders,
} from "../../server/ai/providers";
import { errorResponse } from "../../server/ai/validate";

export const prerender = false;

const aiEnv = env as unknown as AiEnv;
const NO_STORE = { "Cache-Control": "no-store" };

export const GET: APIRoute = async ({ url }) => {
	const provider = url.searchParams.get("provider");
	if (provider === null) {
		return Response.json(
			{ providers: listProviders(aiEnv) },
			{ headers: NO_STORE },
		);
	}
	if (!isProviderId(provider)) {
		return errorResponse(`Unknown provider: ${provider}`, 400);
	}
	if (isLocalProvider(provider)) {
		return Response.json(await listLocalModels(aiEnv, provider), {
			headers: NO_STORE,
		});
	}
	const info = listProviders(aiEnv).find((entry) => entry.id === provider);
	return Response.json(
		{ ok: true, models: info?.models ?? [] },
		{ headers: NO_STORE },
	);
};
