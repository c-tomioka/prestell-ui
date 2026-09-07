// User-facing text for the chat panel's error and setup notices.
//
// Everything the user reads about a failure is composed here from a code and
// its parameters (`error-codes.ts`), so this file is the single place to edit
// wording and, later, the seed of a translation table.
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
const START_LOCAL_SERVER: Record<LocalProvider, string> = {
	ollama: "Run `ollama serve`",
	lmstudio: "In LM Studio, open the Developer tab and press Start Server",
};

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
		return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)
			? "Localhost origins are allowed by default; if you changed `OLLAMA_ORIGINS`, include this origin."
			: `Start it with \`OLLAMA_ORIGINS=${origin} ollama serve\` so it accepts requests from this origin.`;
	}
	return "Start the server with CORS enabled: `lms server start --cors`, or turn on “Enable CORS” in the Developer tab.";
}

function providerName(provider: ProviderId): string {
	return PROVIDER_NAMES[provider];
}

/** Text for a coded error from `/api/chat` or the direct transport. */
export function describeCodedError(error: CodedError): string {
	switch (error.code) {
		case "local-unreachable":
			return `Cannot reach ${LOCAL_PROVIDER_NAMES[error.provider]} at ${error.base}. ${START_LOCAL_SERVER[error.provider]}, then retry.`;
		case "timeout":
			return `The model did not respond in time (${error.detail}). Retry, or pick another model or provider.`;
		case "direct-unreachable":
			return `Cannot reach ${LOCAL_PROVIDER_NAMES[error.provider]} at ${error.base} from the browser. ${START_LOCAL_SERVER[error.provider]}. ${corsInstruction(error.provider, error.origin)}`;
		case "direct-network":
			return `Could not reach ${providerName(error.provider)} from the browser (${error.detail}). Check your network connection, then retry.`;
		case "direct-unsupported":
			return `${providerName(error.provider)} cannot be called from the browser (Cloudflare AI Gateway sends no CORS headers). Switch Connection to Server to use it.`;
		case "key-missing":
			return `No API key for ${providerName(error.provider)}. Paste your key in the API key field above; it stays in this tab and is sent only to ${providerName(error.provider)}.`;
		case "key-rejected":
			return `${providerName(error.provider)} rejected the API key (HTTP ${error.status}). Check the key, then retry.`;
		case "provider-error":
			return error.status === 429
				? `${providerName(error.provider)} is rate limiting this key (HTTP 429${error.detail ? `: ${error.detail}` : ""}). Wait a moment, then retry.`
				: `${providerName(error.provider)} returned HTTP ${error.status}${error.detail ? `: ${error.detail}` : ""}.`;
	}
}

/** Shown under the model field when `/api/models` cannot reach the local server. */
export function localServerHint(provider: LocalProvider): string {
	return provider === "ollama"
		? "Ollama is not running or has no models. Run `ollama serve` and pull a model with `ollama pull <model>`."
		: "The LM Studio server is not running. In LM Studio, open the Developer tab, press Start Server, and load a model.";
}

/** Shown when the local server answered but lists no models. */
export const NO_LOCAL_MODELS =
	"No models found on the local server. Pull or load a model, then reload.";

// --- direct mode (browser → provider) ---

/** Provider hint in direct mode for a local server. */
export function directLocalHint(
	provider: LocalProvider,
	base: string,
	origin: string,
): string {
	return `Called from the browser at ${base}. ${corsInstruction(provider, origin)}`;
}

/** Provider hint in direct mode for a cloud provider (BYOK). */
export function directKeyHint(provider: DirectCloudProviderId): string {
	return `Requests go from your browser straight to ${providerName(provider)} with your own API key, so usage and rate limits are billed to your account. The key is kept in this tab only (sessionStorage), never in localStorage or the URL.`;
}

/** One line under the API key field, always visible (the help panel has the details). */
export const KEY_FIELD_NOTE =
	"Billed to your own account. Kept in this tab only; never stored elsewhere.";

/** Status line for a saved key: the last characters only, so keys stay recognisable but unrecoverable. */
export function keySavedLabel(key: string): string {
	const trimmed = key.trim();
	if (trimmed.length < 12) return "Key saved for this tab.";
	return `Key saved for this tab (…${trimmed.slice(-4)}).`;
}

/** Where to create an API key, per cloud provider. */
export const KEY_LINKS: Record<
	DirectCloudProviderId,
	{ label: string; href: string }
> = {
	anthropic: {
		label: "Get an Anthropic API key",
		href: "https://console.anthropic.com/settings/keys",
	},
	openai: {
		label: "Get an OpenAI API key",
		href: "https://platform.openai.com/api-keys",
	},
	google: {
		label: "Get a Google AI Studio API key",
		href: "https://aistudio.google.com/app/apikey",
	},
};

export const DIRECT_HELP_TITLE = "How direct mode works";

export interface DirectHelp {
	points: string[];
	/** Cloud providers: where to create a key. */
	link?: { label: string; href: string };
}

/**
 * Contents of the "How direct mode works" panel for the chosen provider:
 * what leaves the browser, who gets billed, where the key lives, and how to
 * get set up. Local servers get the CORS instruction instead of a key link.
 */
export function directHelp(provider: ProviderId, origin: string): DirectHelp {
	const name = providerName(provider);
	if (isLocalProvider(provider)) {
		return {
			points: [
				`Requests go from this browser straight to ${name} on your machine; this app has no server in between.`,
				"Nothing is billed: the model runs locally. Astro docs searches go through a small relay that only sees the search text.",
				`${START_LOCAL_SERVER[provider]}. ${corsInstruction(provider, origin)}`,
			],
		};
	}
	if (isDirectCloudProvider(provider)) {
		return {
			points: [
				`Requests go from this browser straight to ${name}; this app has no server in between and never sees your key.`,
				`Usage, rate limits, and billing are tied to your own ${name} account. Keep an eye on your usage there.`,
				"The key stays in this tab (sessionStorage): it is gone when the tab closes and is never written to localStorage, the URL, or saved projects. “Forget all keys” removes it right away.",
				"Astro docs searches go through a small relay that only sees the search text, never your key or your code.",
			],
			link: KEY_LINKS[provider],
		};
	}
	return {
		points: [
			`${name} cannot be called from the browser (Cloudflare AI Gateway sends no CORS headers). Pick another provider, or use Connection: Server.`,
		],
	};
}

/** Extra line in the empty chat while direct mode is active. */
export function emptyDirectNote(provider: ProviderId): string {
	return isDirectCloudProvider(provider)
		? `Direct mode: your prompt goes straight from this browser to ${providerName(provider)} with your own API key.`
		: `Direct mode: your prompt goes straight from this browser to ${providerName(provider)}.`;
}

/** Warning under the model field while the key for the chosen provider is empty. */
export function keyMissingNotice(provider: DirectCloudProviderId): string {
	return `Enter your ${providerName(provider)} API key to use direct mode.`;
}

/** Provider hint for providers the browser cannot call. */
export function directUnsupportedHint(provider: ProviderId): string {
	return `${providerName(provider)} is only available with Connection: Server (Cloudflare AI Gateway has no CORS headers).`;
}

export const CONNECTION_HINTS: Record<"server" | "direct", string> = {
	server:
		"Requests go through this app's /api/chat; provider keys stay in .dev.vars on the server.",
	direct:
		"Requests go from the browser straight to the provider (bring your own key). Works without the API server.",
};
