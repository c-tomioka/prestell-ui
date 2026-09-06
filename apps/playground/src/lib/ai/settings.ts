// Chat settings persisted per browser (provider/model choice, toggles).
import type { DocsMode } from "../../server/ai/validate";
import { clampFixAttempts, DEFAULT_MAX_FIX_ATTEMPTS } from "./fix-loop";

export type { DocsMode };

export interface ChatSettings {
	/** Schema version of the stored blob; `loadSettings` migrates older ones. */
	version: number;
	provider: string;
	/** Model id per provider id. */
	models: Record<string, string>;
	docsMode: DocsMode;
	autoApply: boolean;
	chatOpen: boolean;
	/** Send validation errors back to the model automatically. */
	autoFix: boolean;
	/** Upper bound of fix requests per user message (1–5). */
	maxFixAttempts: number;
	/** Provider offered as "Retry with …" after a failed request ("" = none). */
	fallbackProvider: string;
}

const STORAGE_KEY = "prestell.chat.settings";

/**
 * v1: no version field, docsMode defaulted to "off".
 * v2 (2026-09-07): docsMode defaults to "inject" (the evaluation showed it
 * removes hallucinations for every model). Stored "off" from v1 is migrated
 * because v1 saved the blob eagerly, so it was rarely a deliberate choice.
 */
export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: ChatSettings = {
	version: SETTINGS_VERSION,
	provider: "ollama",
	models: {},
	docsMode: "inject",
	autoApply: true,
	chatOpen: true,
	autoFix: true,
	maxFixAttempts: DEFAULT_MAX_FIX_ATTEMPTS,
	fallbackProvider: "",
};

function migrate(parsed: Partial<ChatSettings>): Partial<ChatSettings> {
	const version = typeof parsed.version === "number" ? parsed.version : 1;
	const next = { ...parsed };
	if (version < 2 && next.docsMode === "off") next.docsMode = "inject";
	return { ...next, version: SETTINGS_VERSION };
}

export function loadSettings(): ChatSettings {
	if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_SETTINGS };
		const parsed = migrate(JSON.parse(raw) as Partial<ChatSettings>);
		return {
			...DEFAULT_SETTINGS,
			...parsed,
			models: { ...(parsed.models ?? {}) },
			maxFixAttempts: clampFixAttempts(parsed.maxFixAttempts),
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
