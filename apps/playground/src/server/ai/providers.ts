// Server-side LLM provider registry.
//
// Every provider is reached through an OpenAI-compatible `/chat/completions`
// endpoint, so a single `@ai-sdk/openai-compatible` client covers all of them:
//   - local:   Ollama / LM Studio, fetched directly from the Worker (no API key)
//   - gateway: Cloudflare AI Gateway. Current REST API
//              (api.cloudflare.com/client/v4/accounts/{id}/ai/v1/chat/completions) or the
//              legacy `gateway.ai.cloudflare.com/.../compat` endpoint; see gatewayConfig().
// AI Gateway custom providers require HTTPS base URLs, so localhost models can
// never be registered there; that is why local providers bypass the gateway.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
	CLOUD_MODELS,
	DEFAULT_LMSTUDIO_BASE_URL,
	DEFAULT_OLLAMA_BASE_URL,
	type GatewayKind,
	type GatewayProviderId,
	gatewayModelId,
	isLocalProvider,
	type LocalProviderId,
	PROVIDER_LABELS,
	type ProviderId,
	type ProviderInfo,
	trimSlash,
} from "../../lib/ai/providers-catalog";

// The catalogue (ids, labels, static model lists, id spelling) is shared with
// the browser-side direct mode; see `src/lib/ai/providers-catalog.ts`.
export {
	DEFAULT_ASTRO_DOCS_MCP_URL,
	DEFAULT_LMSTUDIO_BASE_URL,
	DEFAULT_OLLAMA_BASE_URL,
	type GatewayKind,
	type GatewayProviderId,
	gatewayModelId,
	isLocalProvider,
	isProviderId,
	type LocalProviderId,
	PROVIDER_IDS,
	type ProviderId,
	type ProviderInfo,
	type ProviderKind,
} from "../../lib/ai/providers-catalog";

/** Secrets and settings read from `.dev.vars` (dev) or Worker secrets (prod). */
export interface AiEnv {
	OLLAMA_BASE_URL?: string;
	LMSTUDIO_BASE_URL?: string;
	CF_AI_GATEWAY_URL?: string;
	CF_AI_GATEWAY_TOKEN?: string;
	/** Gateway name for the REST API (`cf-aig-gateway-id`), e.g. `default`. */
	CF_AI_GATEWAY_ID?: string;
	ANTHROPIC_API_KEY?: string;
	OPENAI_API_KEY?: string;
	GOOGLE_API_KEY?: string;
	ASTRO_DOCS_MCP_URL?: string;
}

export function readEnv(env: AiEnv, key: keyof AiEnv): string | undefined {
	const value = env[key];
	return typeof value === "string" && value.trim() !== ""
		? value.trim()
		: undefined;
}

export function localBaseUrl(env: AiEnv, provider: LocalProviderId): string {
	return trimSlash(
		provider === "ollama"
			? (readEnv(env, "OLLAMA_BASE_URL") ?? DEFAULT_OLLAMA_BASE_URL)
			: (readEnv(env, "LMSTUDIO_BASE_URL") ?? DEFAULT_LMSTUDIO_BASE_URL),
	);
}

const GATEWAY_PROVIDER_IDS: GatewayProviderId[] = [
	"anthropic",
	"openai",
	"google",
	"workers-ai",
];

export interface GatewayConfig {
	/** `rest` = api.cloudflare.com/.../ai/v1 (current); `compat` = gateway.ai.cloudflare.com/.../compat (legacy). */
	kind: GatewayKind;
	baseURL: string;
	headers: Record<string, string>;
	/** Sent as `Authorization: Bearer …`. */
	apiKey?: string;
	gatewayId?: string;
}

const REST_URL =
	/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/([^/]+)(?:\/ai(?:\/.*)?)?\/?$/i;
const COMPAT_URL =
	/^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/([^/]+)\/([^/]+)(?:\/compat(?:\/.*)?)?\/?$/i;

/**
 * Derive the gateway connection from the env. Accepts both URL styles the
 * Cloudflare dashboard has shown over time:
 *   - REST API (current):  https://api.cloudflare.com/client/v4/accounts/{account_id}/ai[/run|/v1/...]
 *       → baseURL {…}/ai/v1, `Authorization: Bearer CF_AI_GATEWAY_TOKEN`
 *         (Cloudflare API token, "Workers AI: Read"), `cf-aig-gateway-id: CF_AI_GATEWAY_ID`.
 *         Third-party keys come from BYOK / Unified Billing configured in the dashboard.
 *   - Legacy compat:        https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}[/compat]
 *       → baseURL {…}/compat, `cf-aig-authorization: Bearer CF_AI_GATEWAY_TOKEN`,
 *         optional provider key as `Authorization` when no BYOK key is stored.
 * Returns null when the gateway is not configured.
 */
export function gatewayConfig(
	env: AiEnv,
	provider?: GatewayProviderId,
): GatewayConfig | null {
	const url = readEnv(env, "CF_AI_GATEWAY_URL");
	const token = readEnv(env, "CF_AI_GATEWAY_TOKEN");
	if (!url || !token) return null;

	const rest = REST_URL.exec(url);
	if (rest) {
		const gatewayId = readEnv(env, "CF_AI_GATEWAY_ID");
		// The REST API only bills third-party models through Unified Billing or a
		// BYOK key stored in the gateway. When the user put a provider key in
		// .dev.vars instead, route that provider through the legacy compat
		// endpoint, which forwards the key to the provider (verified live).
		const localKey = provider ? localProviderKey(env, provider) : undefined;
		if (localKey && provider !== "workers-ai") {
			return {
				kind: "compat",
				baseURL: `https://gateway.ai.cloudflare.com/v1/${rest[1]}/${gatewayId ?? "default"}/compat`,
				headers: { "cf-aig-authorization": `Bearer ${token}` },
				apiKey: localKey,
				gatewayId: gatewayId ?? "default",
			};
		}
		const headers: Record<string, string> = {};
		if (gatewayId) headers["cf-aig-gateway-id"] = gatewayId;
		return {
			kind: "rest",
			baseURL: `https://api.cloudflare.com/client/v4/accounts/${rest[1]}/ai/v1`,
			headers,
			apiKey: token,
			gatewayId,
		};
	}

	const compat = COMPAT_URL.exec(url);
	if (compat) {
		const providerKey =
			provider === "workers-ai"
				? token
				: provider
					? localProviderKey(env, provider)
					: undefined;
		return {
			kind: "compat",
			baseURL: `https://gateway.ai.cloudflare.com/v1/${compat[1]}/${compat[2]}/compat`,
			headers: { "cf-aig-authorization": `Bearer ${token}` },
			apiKey: providerKey,
			gatewayId: compat[2],
		};
	}

	throw new Error(
		"CF_AI_GATEWAY_URL must look like https://api.cloudflare.com/client/v4/accounts/{account_id}/ai (REST API) or https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id} (legacy).",
	);
}

function localProviderKey(
	env: AiEnv,
	provider: GatewayProviderId,
): string | undefined {
	switch (provider) {
		case "anthropic":
			return readEnv(env, "ANTHROPIC_API_KEY");
		case "openai":
			return readEnv(env, "OPENAI_API_KEY");
		case "google":
			return readEnv(env, "GOOGLE_API_KEY");
		default:
			return undefined;
	}
}

/**
 * Workers AI occasionally streams `delta.content` as a JSON number (e.g. a
 * bare `2`) or, on the trailing usage chunk, as a boolean, which the
 * OpenAI-compatible parser rejects. Coerce numbers to their text and booleans
 * to an empty string on the way in so the stream keeps flowing.
 */
export function sanitizingFetch(fetchImpl: typeof fetch = fetch): typeof fetch {
	const fixLine = (line: string): string => {
		if (!line.startsWith("data:")) return line;
		const payload = line.slice(5).trim();
		if (!payload || payload === "[DONE]") return line;
		try {
			const json = JSON.parse(payload) as {
				choices?: Array<{
					delta?: { content?: unknown };
					message?: { content?: unknown };
				}>;
			};
			let changed = false;
			for (const choice of json.choices ?? []) {
				for (const part of [choice.delta, choice.message]) {
					if (part && typeof part.content === "number") {
						part.content = String(part.content);
						changed = true;
					} else if (part && typeof part.content === "boolean") {
						part.content = "";
						changed = true;
					}
				}
			}
			return changed ? `data: ${JSON.stringify(json)}` : line;
		} catch {
			return line;
		}
	};
	return async (input, init) => {
		const response = await fetchImpl(input, init);
		const type = response.headers.get("content-type") ?? "";
		if (!response.body || !type.includes("text/event-stream")) return response;
		let buffer = "";
		const decoder = new TextDecoder();
		const encoder = new TextEncoder();
		const transformed = response.body.pipeThrough(
			new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) {
					buffer += decoder.decode(chunk, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					if (lines.length > 0) {
						controller.enqueue(
							encoder.encode(`${lines.map(fixLine).join("\n")}\n`),
						);
					}
				},
				flush(controller) {
					if (buffer) controller.enqueue(encoder.encode(fixLine(buffer)));
				},
			}),
		);
		return new Response(transformed, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	};
}

function safeGatewayConfig(env: AiEnv): GatewayConfig | null | "invalid" {
	try {
		return gatewayConfig(env);
	} catch {
		return "invalid";
	}
}

export function listProviders(env: AiEnv): ProviderInfo[] {
	const local: ProviderInfo[] = [
		{
			id: "ollama",
			label: PROVIDER_LABELS.ollama,
			kind: "local",
			configured: true,
			hint: `OpenAI-compatible server expected at ${localBaseUrl(env, "ollama")}.`,
			models: [],
		},
		{
			id: "lmstudio",
			label: PROVIDER_LABELS.lmstudio,
			kind: "local",
			configured: true,
			hint: `LM Studio server expected at ${localBaseUrl(env, "lmstudio")}.`,
			models: [],
		},
	];
	const gateway = safeGatewayConfig(env);
	const configured = gateway !== null && gateway !== "invalid";
	const entries = GATEWAY_PROVIDER_IDS.map<ProviderInfo>((id) => {
		let hint: string | undefined;
		if (gateway === "invalid") {
			hint =
				"CF_AI_GATEWAY_URL has an unexpected format. See .dev.vars.example.";
		} else if (!gateway) {
			hint = "Set CF_AI_GATEWAY_URL and CF_AI_GATEWAY_TOKEN in .dev.vars.";
		} else if (gateway.kind === "rest") {
			hint =
				id === "workers-ai" && !gateway.gatewayId
					? "Workers AI needs CF_AI_GATEWAY_ID (the gateway name, e.g. default)."
					: id === "workers-ai"
						? "Billed to your Cloudflare account (free daily Neurons)."
						: localProviderKey(env, id)
							? "Uses the provider key from .dev.vars through the gateway (BYOK passthrough)."
							: "Provider key comes from AI Gateway (BYOK stored key or Unified Billing), or set it in .dev.vars.";
		} else if (id !== "workers-ai" && !gateway.apiKey) {
			hint =
				"No provider key in .dev.vars — relies on a BYOK key stored in AI Gateway.";
		}
		return {
			id,
			label: PROVIDER_LABELS[id],
			kind: "gateway",
			configured:
				configured &&
				!(gateway.kind === "rest" && id === "workers-ai" && !gateway.gatewayId),
			hint,
			models: CLOUD_MODELS[id],
		};
	});
	return [...local, ...entries];
}

/** Build the AI SDK model for a provider/model pair. Throws with a user-facing message. */
export function resolveModel(
	env: AiEnv,
	provider: ProviderId,
	modelId: string,
): LanguageModel {
	if (isLocalProvider(provider)) {
		const client = createOpenAICompatible({
			name: provider,
			baseURL: localBaseUrl(env, provider),
			includeUsage: true,
		});
		return client.chatModel(modelId);
	}

	const gateway = gatewayConfig(env, provider);
	if (!gateway) {
		throw new Error(
			"Cloudflare AI Gateway is not configured. Set CF_AI_GATEWAY_URL and CF_AI_GATEWAY_TOKEN in .dev.vars.",
		);
	}
	if (
		gateway.kind === "rest" &&
		provider === "workers-ai" &&
		!gateway.gatewayId
	) {
		throw new Error(
			"Workers AI through the REST API requires CF_AI_GATEWAY_ID in .dev.vars.",
		);
	}
	const client = createOpenAICompatible({
		name: `ai-gateway-${provider}`,
		baseURL: gateway.baseURL,
		apiKey: gateway.apiKey,
		headers: gateway.headers,
		includeUsage: true,
		fetch: sanitizingFetch(),
	});
	return client.chatModel(gatewayModelId(provider, modelId, gateway.kind));
}

export type LocalModelsResult =
	| { ok: true; models: string[] }
	/** `error` is the transport detail; the UI composes its own text from `code`. */
	| {
			ok: false;
			error: string;
			code: "local-unreachable";
			provider: LocalProviderId;
	  };

/** List models exposed by a local OpenAI-compatible server. */
export async function listLocalModels(
	env: AiEnv,
	provider: LocalProviderId,
	fetchImpl: typeof fetch = fetch,
): Promise<LocalModelsResult> {
	const base = localBaseUrl(env, provider);
	try {
		const response = await fetchImpl(`${base}/models`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) {
			return {
				ok: false,
				error: `${base}/models returned HTTP ${response.status}`,
				code: "local-unreachable",
				provider,
			};
		}
		const payload = (await response.json()) as {
			data?: Array<{ id?: unknown }> | null;
		};
		const models = (payload.data ?? [])
			.map((model) => model?.id)
			.filter((id): id is string => typeof id === "string")
			.sort();
		return { ok: true, models };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
			code: "local-unreachable",
			provider,
		};
	}
}
