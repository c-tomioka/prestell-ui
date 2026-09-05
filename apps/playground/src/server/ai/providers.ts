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

export const PROVIDER_IDS = [
	"ollama",
	"lmstudio",
	"anthropic",
	"openai",
	"google",
	"workers-ai",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export type LocalProviderId = "ollama" | "lmstudio";
export type GatewayProviderId = Exclude<ProviderId, LocalProviderId>;

export type ProviderKind = "local" | "gateway";

export interface ProviderInfo {
	id: ProviderId;
	label: string;
	kind: ProviderKind;
	/** True when the env has what is needed to call this provider. */
	configured: boolean;
	/** Shown in the UI next to the provider (setup hints, BYOK notes). */
	hint?: string;
	/** Static model suggestions (local providers list models dynamically). */
	models: string[];
}

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

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";
export const DEFAULT_LMSTUDIO_BASE_URL = "http://localhost:1234/v1";
export const DEFAULT_ASTRO_DOCS_MCP_URL = "https://mcp.docs.astro.build/mcp";

function trimSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

export function readEnv(env: AiEnv, key: keyof AiEnv): string | undefined {
	const value = env[key];
	return typeof value === "string" && value.trim() !== ""
		? value.trim()
		: undefined;
}

export function isLocalProvider(
	provider: ProviderId,
): provider is LocalProviderId {
	return provider === "ollama" || provider === "lmstudio";
}

export function localBaseUrl(env: AiEnv, provider: LocalProviderId): string {
	return trimSlash(
		provider === "ollama"
			? (readEnv(env, "OLLAMA_BASE_URL") ?? DEFAULT_OLLAMA_BASE_URL)
			: (readEnv(env, "LMSTUDIO_BASE_URL") ?? DEFAULT_LMSTUDIO_BASE_URL),
	);
}

interface GatewayProvider {
	label: string;
	/** Prefix used by the AI Gateway REST API (`{prefix}/{model}`); empty = model id as-is. */
	prefix: string;
	models: string[];
}

const GATEWAY_PROVIDERS: Record<GatewayProviderId, GatewayProvider> = {
	anthropic: {
		label: "Anthropic Claude",
		prefix: "anthropic",
		models: [
			"claude-sonnet-4.5",
			"claude-sonnet-5",
			"claude-opus-5",
			"claude-haiku-4.5",
		],
	},
	openai: {
		label: "OpenAI",
		prefix: "openai",
		models: ["gpt-5.2", "gpt-5-mini"],
	},
	google: {
		label: "Google Gemini",
		prefix: "google",
		models: ["gemini-3-flash", "gemini-2.5-pro", "gemini-2.5-flash"],
	},
	"workers-ai": {
		label: "Cloudflare Workers AI",
		// Workers AI models are addressed as `@cf/author/model` directly.
		prefix: "",
		// llama-4-scout handles tool calling (docsMode "tools"); llama-3.3 streams fine
		// but rejects tool results; frontier models such as kimi-k2.6 need prepaid credits.
		models: [
			"@cf/meta/llama-4-scout-17b-16e-instruct",
			"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
			"@cf/qwen/qwen2.5-coder-32b-instruct",
		],
	},
};

export type GatewayKind = "rest" | "compat";

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
 * Full model id for the gateway, e.g. `anthropic/claude-sonnet-4.5` or `@cf/meta/...`.
 *
 * Anthropic ids differ by endpoint: the REST catalog uses dots in the version
 * (`claude-sonnet-4.5`) while the provider API — reached through the compat
 * endpoint — uses hyphens (`claude-sonnet-4-5`). Accept either spelling.
 */
export function gatewayModelId(
	provider: GatewayProviderId,
	modelId: string,
	kind: GatewayKind = "rest",
): string {
	const prefix = GATEWAY_PROVIDERS[provider].prefix;
	if (!prefix) return modelId;
	let bare = modelId.includes("/")
		? modelId.slice(modelId.indexOf("/") + 1)
		: modelId;
	if (provider === "anthropic") {
		bare =
			kind === "rest"
				? bare.replace(/^(claude-[a-z]+-\d)-(\d)(?=$|-)/, "$1.$2")
				: bare.replace(/^(claude-[a-z]+-\d)\.(\d)/, "$1-$2");
	}
	return `${prefix}/${bare}`;
}

/**
 * Workers AI occasionally streams `delta.content` as a JSON number (e.g. a
 * bare `2`), which the OpenAI-compatible parser rejects. Coerce it to a string
 * on the way in so the stream keeps flowing.
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
			label: "Ollama (local)",
			kind: "local",
			configured: true,
			hint: `OpenAI-compatible server expected at ${localBaseUrl(env, "ollama")}.`,
			models: [],
		},
		{
			id: "lmstudio",
			label: "LM Studio (local)",
			kind: "local",
			configured: true,
			hint: `LM Studio server expected at ${localBaseUrl(env, "lmstudio")}.`,
			models: [],
		},
	];
	const gateway = safeGatewayConfig(env);
	const configured = gateway !== null && gateway !== "invalid";
	const entries = (
		Object.entries(GATEWAY_PROVIDERS) as [GatewayProviderId, GatewayProvider][]
	).map<ProviderInfo>(([id, spec]) => {
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
			label: spec.label,
			kind: "gateway",
			configured:
				configured &&
				!(gateway.kind === "rest" && id === "workers-ai" && !gateway.gatewayId),
			hint,
			models: spec.models,
		};
	});
	return [...local, ...entries];
}

export function isProviderId(value: unknown): value is ProviderId {
	return (
		typeof value === "string" &&
		(PROVIDER_IDS as readonly string[]).includes(value)
	);
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
	| { ok: false; error: string; hint: string };

/** List models exposed by a local OpenAI-compatible server. */
export async function listLocalModels(
	env: AiEnv,
	provider: LocalProviderId,
	fetchImpl: typeof fetch = fetch,
): Promise<LocalModelsResult> {
	const base = localBaseUrl(env, provider);
	const hint =
		provider === "ollama"
			? "Ollama が起動していないか、モデルがありません。`ollama serve` を実行し、`ollama pull <model>` でモデルを取得してください。"
			: "LM Studio のサーバーが起動していません。LM Studio の Developer タブで Start Server を押し、モデルをロードしてください。";
	try {
		const response = await fetchImpl(`${base}/models`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) {
			return {
				ok: false,
				error: `${base}/models returned HTTP ${response.status}`,
				hint,
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
			hint,
		};
	}
}
