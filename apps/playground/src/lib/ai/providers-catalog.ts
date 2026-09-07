// Provider catalogue shared by the server (`/api/chat`, `/api/models`) and the
// browser-side direct mode: ids, labels, static model suggestions, default
// local endpoints, and the model-id spelling each endpoint expects. Nothing in
// here reads the environment or holds a secret.

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
/** Providers reached through Cloudflare AI Gateway in server mode. */
export type GatewayProviderId = Exclude<ProviderId, LocalProviderId>;
/** Cloud providers the browser can call directly with the user's own key (BYOK). */
export type DirectCloudProviderId = "anthropic" | "openai" | "google";

/**
 * `local`   = Ollama / LM Studio (no key);
 * `gateway` = through Cloudflare AI Gateway from the server;
 * `direct`  = from the browser with a user-supplied key.
 */
export type ProviderKind = "local" | "gateway" | "direct";

export interface ProviderInfo {
	id: ProviderId;
	label: string;
	kind: ProviderKind;
	/** True when this connection has what is needed to call the provider. */
	configured: boolean;
	/** Why it is not configured, when that needs a different label than "not configured". */
	unavailable?: "server-only";
	/** Shown in the UI next to the provider (setup hints, BYOK notes). */
	hint?: string;
	/** Static model suggestions (local providers list models dynamically). */
	models: string[];
}

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";
export const DEFAULT_LMSTUDIO_BASE_URL = "http://localhost:1234/v1";
export const DEFAULT_ASTRO_DOCS_MCP_URL = "https://mcp.docs.astro.build/mcp";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
	ollama: "Ollama (local)",
	lmstudio: "LM Studio (local)",
	anthropic: "Anthropic Claude",
	openai: "OpenAI",
	google: "Google Gemini",
	"workers-ai": "Cloudflare Workers AI",
};

/** Short vendor names for messages ("Cannot reach Ollama …"). */
export const PROVIDER_NAMES: Record<ProviderId, string> = {
	ollama: "Ollama",
	lmstudio: "LM Studio",
	anthropic: "Anthropic",
	openai: "OpenAI",
	google: "Google AI Studio",
	"workers-ai": "Workers AI",
};

/**
 * Static model suggestions per cloud provider, in the AI Gateway REST catalog
 * spelling (the direct mode converts Anthropic ids with `providerModelId`).
 */
export const CLOUD_MODELS: Record<GatewayProviderId, string[]> = {
	anthropic: [
		"claude-sonnet-4.5",
		"claude-sonnet-5",
		"claude-opus-5",
		"claude-haiku-4.5",
	],
	openai: ["gpt-5.2", "gpt-5-mini"],
	google: ["gemini-3-flash", "gemini-2.5-pro", "gemini-2.5-flash"],
	// llama-4-scout handles tool calling (docsMode "tools"); llama-3.3 streams fine
	// but rejects tool results; frontier models such as kimi-k2.6 need prepaid credits.
	"workers-ai": [
		"@cf/meta/llama-4-scout-17b-16e-instruct",
		"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		"@cf/qwen/qwen2.5-coder-32b-instruct",
	],
};

/** Prefix used by the AI Gateway REST API (`{prefix}/{model}`); empty = model id as-is. */
export const GATEWAY_PREFIX: Record<GatewayProviderId, string> = {
	anthropic: "anthropic",
	openai: "openai",
	google: "google",
	"workers-ai": "",
};

export function isProviderId(value: unknown): value is ProviderId {
	return (
		typeof value === "string" &&
		(PROVIDER_IDS as readonly string[]).includes(value)
	);
}

export function isLocalProvider(
	provider: ProviderId,
): provider is LocalProviderId {
	return provider === "ollama" || provider === "lmstudio";
}

export function isDirectCloudProvider(
	provider: ProviderId,
): provider is DirectCloudProviderId {
	return (
		provider === "anthropic" || provider === "openai" || provider === "google"
	);
}

/**
 * Providers the browser can call without a server. Workers AI is excluded:
 * Cloudflare AI Gateway answers preflight requests without CORS headers
 * (verified 2026-09-07 against both the REST and the legacy compat endpoints),
 * so it stays server-only.
 */
export function isDirectProvider(
	provider: ProviderId,
): provider is LocalProviderId | DirectCloudProviderId {
	return isLocalProvider(provider) || isDirectCloudProvider(provider);
}

export function defaultLocalBaseUrl(provider: LocalProviderId): string {
	return provider === "ollama"
		? DEFAULT_OLLAMA_BASE_URL
		: DEFAULT_LMSTUDIO_BASE_URL;
}

export function trimSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

export type GatewayKind = "rest" | "compat";

/** Strip a `vendor/` prefix the user may have typed. */
function bareModelId(modelId: string): string {
	return modelId.includes("/")
		? modelId.slice(modelId.indexOf("/") + 1)
		: modelId;
}

/**
 * Anthropic ids differ by endpoint: the REST catalog uses dots in the version
 * (`claude-sonnet-4.5`) while the provider API — reached through the compat
 * endpoint or directly — uses hyphens (`claude-sonnet-4-5`). Accept either.
 */
function anthropicModelId(modelId: string, kind: GatewayKind): string {
	return kind === "rest"
		? modelId.replace(/^(claude-[a-z]+-\d)-(\d)(?=$|-)/, "$1.$2")
		: modelId.replace(/^(claude-[a-z]+-\d)\.(\d)/, "$1-$2");
}

/** Full model id for the gateway, e.g. `anthropic/claude-sonnet-4.5` or `@cf/meta/...`. */
export function gatewayModelId(
	provider: GatewayProviderId,
	modelId: string,
	kind: GatewayKind = "rest",
): string {
	const prefix = GATEWAY_PREFIX[provider];
	if (!prefix) return modelId;
	let bare = bareModelId(modelId);
	if (provider === "anthropic") bare = anthropicModelId(bare, kind);
	return `${prefix}/${bare}`;
}

/** Model id in the vendor's own spelling, as sent by the direct mode. */
export function providerModelId(
	provider: DirectCloudProviderId,
	modelId: string,
): string {
	const bare = bareModelId(modelId.trim());
	return provider === "anthropic" ? anthropicModelId(bare, "compat") : bare;
}
