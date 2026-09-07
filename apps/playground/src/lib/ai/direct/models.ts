// Browser-side model construction for the direct mode.
//
// Local servers use the same OpenAI-compatible client as the server; cloud
// providers use their official AI SDK packages with the user's own key.
// Cloudflare AI Gateway / Workers AI cannot be reached from a browser (no CORS
// headers on preflight, verified 2026-09-07), so `workers-ai` is refused here.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { type CodedError, codedError } from "../error-codes";
import {
	directKeyHint,
	directLocalHint,
	directUnsupportedHint,
} from "../messages";
import {
	CLOUD_MODELS,
	isDirectCloudProvider,
	isLocalProvider,
	type LocalProviderId,
	PROVIDER_IDS,
	PROVIDER_LABELS,
	type ProviderId,
	type ProviderInfo,
	providerModelId,
	trimSlash,
} from "../providers-catalog";
import type { ApiKeys } from "./keys";

export interface DirectModelRequest {
	provider: ProviderId;
	model: string;
	/** Required for cloud providers. */
	apiKey?: string;
	/** Local servers only; defaults to the catalogue default. */
	baseUrl?: string;
}

/**
 * Anthropic refuses browser requests unless the caller opts in explicitly; the
 * header also makes CORS preflight pass. See
 * https://docs.claude.com/en/api/client-sdks (browser usage).
 */
export const ANTHROPIC_BROWSER_HEADERS = {
	"anthropic-dangerous-direct-browser-access": "true",
} as const;

/** Build the AI SDK model in the browser. Throws a coded `Error` when it cannot. */
export function createDirectModel(request: DirectModelRequest): LanguageModel {
	const { provider } = request;
	const modelId = request.model.trim();
	if (isLocalProvider(provider)) {
		const client = createOpenAICompatible({
			name: provider,
			baseURL: trimSlash(request.baseUrl ?? ""),
			includeUsage: true,
		});
		return client.chatModel(modelId);
	}
	if (!isDirectCloudProvider(provider)) {
		throw codedError({ code: "direct-unsupported", provider });
	}
	const apiKey = request.apiKey?.trim();
	if (!apiKey) throw codedError({ code: "key-missing", provider });
	const id = providerModelId(provider, modelId);
	switch (provider) {
		case "anthropic":
			return createAnthropic({
				apiKey,
				headers: ANTHROPIC_BROWSER_HEADERS,
			})(id);
		case "openai":
			return createOpenAI({ apiKey }).chat(id);
		case "google":
			return createGoogle({ apiKey })(id);
	}
}

export interface DirectProviderOptions {
	keys: ApiKeys;
	baseUrls: Record<LocalProviderId, string>;
	/** Page origin, for the CORS instruction in the hints. */
	origin: string;
}

/** Provider list for the picker in direct mode (no server round-trip). */
export function directProviders(
	options: DirectProviderOptions,
): ProviderInfo[] {
	return PROVIDER_IDS.map<ProviderInfo>((id) => {
		if (isLocalProvider(id)) {
			return {
				id,
				label: PROVIDER_LABELS[id],
				kind: "local",
				configured: true,
				hint: directLocalHint(id, options.baseUrls[id], options.origin),
				models: [],
			};
		}
		if (isDirectCloudProvider(id)) {
			return {
				id,
				label: PROVIDER_LABELS[id],
				kind: "direct",
				// Selectable even without a key so the user can paste one.
				configured: true,
				hint: directKeyHint(id),
				models: CLOUD_MODELS[id],
			};
		}
		return {
			id,
			label: PROVIDER_LABELS[id],
			kind: "gateway",
			configured: false,
			unavailableLabel: "server only",
			hint: directUnsupportedHint(id),
			models: CLOUD_MODELS[id],
		};
	});
}

export type DirectModelsResult =
	| { ok: true; models: string[] }
	| { ok: false; coded: CodedError };

/** List models exposed by a local OpenAI-compatible server, from the browser. */
export async function listDirectLocalModels(
	provider: LocalProviderId,
	baseUrl: string,
	origin: string,
	fetchImpl: typeof fetch = fetch,
): Promise<DirectModelsResult> {
	const base = trimSlash(baseUrl);
	const unreachable = (): DirectModelsResult => ({
		ok: false,
		coded: { code: "direct-unreachable", provider, base, origin },
	});
	try {
		const response = await fetchImpl(`${base}/models`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) return unreachable();
		const payload = (await response.json()) as {
			data?: Array<{ id?: unknown }> | null;
		};
		const models = (payload.data ?? [])
			.map((model) => model?.id)
			.filter((id): id is string => typeof id === "string")
			.sort();
		return { ok: true, models };
	} catch {
		return unreachable();
	}
}
