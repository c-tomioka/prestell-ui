// API keys for the direct mode (browser → provider, BYOK).
//
// Keys are held in memory and mirrored to sessionStorage so they survive a
// reload of this tab but disappear when the tab is closed. They are never
// written to localStorage, the URL, the project store, or the chat settings.
import type { DirectCloudProviderId } from "../providers-catalog";

export const KEYS_STORAGE_KEY = "prestell.chat.keys";

export type ApiKeys = Partial<Record<DirectCloudProviderId, string>>;

const KEY_PROVIDERS: DirectCloudProviderId[] = [
	"anthropic",
	"openai",
	"google",
];

let memory: ApiKeys = {};

function storage(): Storage | null {
	try {
		return typeof sessionStorage === "undefined" ? null : sessionStorage;
	} catch {
		// Access can throw (storage disabled); memory is the fallback.
		return null;
	}
}

function persist(): void {
	const store = storage();
	if (!store) return;
	try {
		if (Object.keys(memory).length === 0) store.removeItem(KEYS_STORAGE_KEY);
		else store.setItem(KEYS_STORAGE_KEY, JSON.stringify(memory));
	} catch {
		// Quota / private mode: the key still works for this page load.
	}
}

/** Keys currently known to this tab (memory first, then sessionStorage). */
export function loadKeys(): ApiKeys {
	const store = storage();
	if (store) {
		try {
			const raw = store.getItem(KEYS_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as Record<string, unknown>;
				const restored: ApiKeys = {};
				for (const provider of KEY_PROVIDERS) {
					const value = parsed[provider];
					if (typeof value === "string" && value.trim())
						restored[provider] = value.trim();
				}
				memory = { ...restored, ...memory };
			}
		} catch {
			// Corrupt blob: ignore it.
		}
	}
	return { ...memory };
}

/** Store (or, when empty, drop) the key for one provider. Returns the new set. */
export function saveKey(provider: DirectCloudProviderId, key: string): ApiKeys {
	const trimmed = key.trim();
	if (trimmed) memory[provider] = trimmed;
	else delete memory[provider];
	persist();
	return { ...memory };
}

/** Forget every key in this tab. */
export function forgetKeys(): ApiKeys {
	memory = {};
	persist();
	return {};
}
