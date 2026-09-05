// Server-side LLM provider registry.
//
// Every provider is reached through an OpenAI-compatible `/chat/completions`
// endpoint, so a single `@ai-sdk/openai-compatible` client covers all of them:
//   - local:   Ollama / LM Studio, fetched directly from the Worker (no API key)
//   - gateway: Cloudflare AI Gateway Unified API (`{gateway}/compat`), model ids
//              are prefixed with the upstream provider name.
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
	/** Prefix used by the AI Gateway Unified API (`{prefix}/{model}`). */
	prefix: string;
	keyEnv: keyof AiEnv | null;
	models: string[];
}

const GATEWAY_PROVIDERS: Record<GatewayProviderId, GatewayProvider> = {
	anthropic: {
		label: "Anthropic Claude",
		prefix: "anthropic",
		keyEnv: "ANTHROPIC_API_KEY",
		models: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
	},
	openai: {
		label: "OpenAI",
		prefix: "openai",
		keyEnv: "OPENAI_API_KEY",
		models: ["gpt-5.2", "gpt-5-mini"],
	},
	google: {
		label: "Google Gemini",
		prefix: "google-ai-studio",
		keyEnv: "GOOGLE_API_KEY",
		models: ["gemini-2.5-pro", "gemini-2.5-flash"],
	},
	"workers-ai": {
		label: "Cloudflare Workers AI",
		prefix: "workers-ai",
		// Workers AI is authenticated with the Cloudflare token itself.
		keyEnv: null,
		models: [
			"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
			"@cf/qwen/qwen2.5-coder-32b-instruct",
		],
	},
};

function gatewayConfigured(env: AiEnv): boolean {
	return Boolean(
		readEnv(env, "CF_AI_GATEWAY_URL") && readEnv(env, "CF_AI_GATEWAY_TOKEN"),
	);
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
	const hasGateway = gatewayConfigured(env);
	const gateway = (
		Object.entries(GATEWAY_PROVIDERS) as [GatewayProviderId, GatewayProvider][]
	).map<ProviderInfo>(([id, spec]) => ({
		id,
		label: spec.label,
		kind: "gateway",
		configured: hasGateway,
		hint: hasGateway
			? spec.keyEnv && !readEnv(env, spec.keyEnv)
				? `No ${spec.keyEnv} in .dev.vars — relies on a BYOK key stored in AI Gateway.`
				: undefined
			: "Set CF_AI_GATEWAY_URL and CF_AI_GATEWAY_TOKEN in .dev.vars.",
		models: spec.models,
	}));
	return [...local, ...gateway];
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

	const spec = GATEWAY_PROVIDERS[provider];
	const gatewayUrl = readEnv(env, "CF_AI_GATEWAY_URL");
	const gatewayToken = readEnv(env, "CF_AI_GATEWAY_TOKEN");
	if (!gatewayUrl || !gatewayToken) {
		throw new Error(
			"Cloudflare AI Gateway is not configured. Set CF_AI_GATEWAY_URL and CF_AI_GATEWAY_TOKEN in .dev.vars.",
		);
	}
	const providerKey =
		provider === "workers-ai"
			? gatewayToken
			: spec.keyEnv
				? readEnv(env, spec.keyEnv)
				: undefined;
	const client = createOpenAICompatible({
		name: `ai-gateway-${provider}`,
		baseURL: `${trimSlash(gatewayUrl)}/compat`,
		// `apiKey` becomes `Authorization: Bearer …` (provider key, if we have one);
		// the gateway itself is authenticated with `cf-aig-authorization`.
		apiKey: providerKey,
		headers: { "cf-aig-authorization": `Bearer ${gatewayToken}` },
		includeUsage: true,
	});
	return client.chatModel(`${spec.prefix}/${modelId}`);
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
