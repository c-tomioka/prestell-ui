// User-facing text for the chat panel's error and setup notices.
//
// Everything the user reads about a failure is composed here from a code and
// its parameters (`error-codes.ts`). The wording itself lives in the i18n
// dictionaries (`src/lib/i18n/en.ts`, `ja.ts`); these helpers pick the keys
// and fill the parameters with the current UI language (`tr`).
import { type MessageKey, type Params, tr } from "../i18n";
import type { CodedError, LocalProvider } from "./error-codes";
import {
	type DirectCloudProviderId,
	isDirectCloudProvider,
	isLocalProvider,
	PROVIDER_NAMES,
	type ProviderId,
} from "./providers-catalog";

export const LOCAL_PROVIDER_NAMES: Record<LocalProvider, string> = {
	ollama: "Ollama",
	lmstudio: "LM Studio",
};

/** How to start the local server, per provider. */
export function startLocalServer(provider: LocalProvider): string {
	return tr(provider === "ollama" ? "start.ollama" : "start.lmstudio");
}

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * How to let the browser call the local server (direct mode). Ollama allows
 * localhost origins out of the box; other origins need `OLLAMA_ORIGINS`.
 * LM Studio needs CORS switched on explicitly.
 */
export function corsInstruction(
	provider: LocalProvider,
	origin: string,
): string {
	if (provider === "ollama") {
		return LOOPBACK_ORIGIN.test(origin)
			? tr("cors.ollama.localhost")
			: tr("cors.ollama.origin", { origin });
	}
	return tr("cors.lmstudio");
}

function providerName(provider: ProviderId): string {
	return PROVIDER_NAMES[provider];
}

/** Text for a coded error from `/api/chat` or the direct transport. */
export function describeCodedError(error: CodedError): string {
	switch (error.code) {
		case "local-unreachable":
			return tr("error.localUnreachable", {
				provider: LOCAL_PROVIDER_NAMES[error.provider],
				base: error.base,
				start: startLocalServer(error.provider),
			});
		case "timeout":
			return tr("error.timeout", { detail: error.detail });
		case "direct-unreachable":
			return tr("error.directUnreachable", {
				provider: LOCAL_PROVIDER_NAMES[error.provider],
				base: error.base,
				start: startLocalServer(error.provider),
				cors: corsInstruction(error.provider, error.origin),
			});
		case "direct-network":
			return tr("error.directNetwork", {
				provider: providerName(error.provider),
				detail: error.detail,
			});
		case "direct-unsupported":
			return tr("error.directUnsupported", {
				provider: providerName(error.provider),
			});
		case "key-missing":
			return tr("error.keyMissing", { provider: providerName(error.provider) });
		case "key-rejected":
			return tr("error.keyRejected", {
				provider: providerName(error.provider),
				status: error.status,
			});
		case "provider-error": {
			const detail = error.detail ? `: ${error.detail}` : "";
			return error.status === 429
				? tr("error.rateLimited", {
						provider: providerName(error.provider),
						detail,
					})
				: tr("error.providerError", {
						provider: providerName(error.provider),
						status: error.status,
						detail,
					});
		}
	}
}

/** Shown under the model field when `/api/models` cannot reach the local server. */
export function localServerHint(provider: LocalProvider): string {
	return tr(provider === "ollama" ? "hint.ollamaDown" : "hint.lmstudioDown");
}

/** Shown when the local server answered but lists no models. */
export function noLocalModels(): string {
	return tr("hint.noLocalModels");
}

// --- direct mode (browser → provider) ---

/** Provider hint in direct mode for a local server. */
export function directLocalHint(
	provider: LocalProvider,
	base: string,
	origin: string,
): string {
	return tr("hint.directLocal", {
		base,
		cors: corsInstruction(provider, origin),
	});
}

/** Provider hint in direct mode for a cloud provider (BYOK). */
export function directKeyHint(provider: DirectCloudProviderId): string {
	return tr("hint.directKey", { provider: providerName(provider) });
}

/** Status line for a saved key: the last characters only, so keys stay recognisable but unrecoverable. */
export function keySavedLabel(key: string): string {
	const trimmed = key.trim();
	return trimmed.length < 12
		? tr("provider.keySavedShort")
		: tr("provider.keySaved", { tail: trimmed.slice(-4) });
}

/** Where to create an API key, per cloud provider. */
export const KEY_URLS: Record<DirectCloudProviderId, string> = {
	anthropic: "https://console.anthropic.com/settings/keys",
	openai: "https://platform.openai.com/api-keys",
	google: "https://aistudio.google.com/app/apikey",
};

export interface HelpLine {
	key: MessageKey;
	params?: Params;
}

export interface DirectHelpSpec {
	points: HelpLine[];
	/** Cloud providers: where to create a key. */
	link?: { key: MessageKey; href: string };
}

/**
 * Keys and parameters of the "How direct mode works" panel for the chosen
 * provider, so a Svelte component can render them reactively with `$t`.
 * Local servers get the CORS instruction instead of a key link.
 */
export function directHelpSpec(
	provider: ProviderId,
	origin: string,
): DirectHelpSpec {
	const name = providerName(provider);
	if (isLocalProvider(provider)) {
		return {
			points: [
				{ key: "help.local.route", params: { provider: name } },
				{ key: "help.local.billing" },
				{
					key: "help.local.setup",
					params: {
						start: startLocalServer(provider),
						cors: corsInstruction(provider, origin),
					},
				},
			],
		};
	}
	if (isDirectCloudProvider(provider)) {
		return {
			points: [
				{ key: "help.cloud.route", params: { provider: name } },
				{ key: "help.cloud.billing", params: { provider: name } },
				{ key: "help.cloud.storage" },
				{ key: "help.cloud.docs" },
			],
			link: { key: `help.getKey.${provider}`, href: KEY_URLS[provider] },
		};
	}
	return {
		points: [{ key: "help.unsupported", params: { provider: name } }],
	};
}

export interface DirectHelp {
	points: string[];
	link?: { label: string; href: string };
}

/** `directHelpSpec` rendered as text in the current language (tests, non-Svelte callers). */
export function directHelp(provider: ProviderId, origin: string): DirectHelp {
	const spec = directHelpSpec(provider, origin);
	return {
		points: spec.points.map((line) => tr(line.key, line.params)),
		link: spec.link
			? { label: tr(spec.link.key), href: spec.link.href }
			: undefined,
	};
}

/** Extra line in the empty chat while direct mode is active. */
export function emptyDirectNote(provider: ProviderId): string {
	return tr(
		isDirectCloudProvider(provider)
			? "help.emptyNote.cloud"
			: "help.emptyNote.local",
		{ provider: providerName(provider) },
	);
}

/** Warning under the model field while the key for the chosen provider is empty. */
export function keyMissingNotice(provider: DirectCloudProviderId): string {
	return tr("hint.keyMissing", { provider: providerName(provider) });
}

/** Provider hint for providers the browser cannot call. */
export function directUnsupportedHint(provider: ProviderId): string {
	return tr("hint.directUnsupported", { provider: providerName(provider) });
}
