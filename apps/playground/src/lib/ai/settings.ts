// Chat settings persisted per browser (provider/model choice, toggles).
import type { DocsMode } from "../../server/ai/validate";

export type { DocsMode };

export interface ChatSettings {
	provider: string;
	/** Model id per provider id. */
	models: Record<string, string>;
	docsMode: DocsMode;
	autoApply: boolean;
	chatOpen: boolean;
}

const STORAGE_KEY = "prestell.chat.settings";

export const DEFAULT_SETTINGS: ChatSettings = {
	provider: "ollama",
	models: {},
	docsMode: "off",
	autoApply: true,
	chatOpen: true,
};

export function loadSettings(): ChatSettings {
	if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_SETTINGS };
		const parsed = JSON.parse(raw) as Partial<ChatSettings>;
		return {
			...DEFAULT_SETTINGS,
			...parsed,
			models: { ...(parsed.models ?? {}) },
		};
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export function saveSettings(settings: ChatSettings): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Storage can be unavailable (private mode); settings are a convenience only.
	}
}
