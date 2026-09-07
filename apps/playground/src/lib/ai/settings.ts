// Chat settings persisted per browser (provider/model choice, toggles).
//
// API keys for the direct mode are NOT part of this blob: it lives in
// localStorage, keys live in `direct/keys.ts` (sessionStorage / memory).
import { AI_CONNECTIONS, type AiConnections } from "../config";
import type { DocsMode } from "./docs";
import { clampFixAttempts, DEFAULT_MAX_FIX_ATTEMPTS } from "./fix-loop";
import {
	DEFAULT_LMSTUDIO_BASE_URL,
	DEFAULT_OLLAMA_BASE_URL,
	type LocalProviderId,
} from "./providers-catalog";

export type { DocsMode };

/**
 * `server` = the chat goes through `/api/chat` (keys stay on the server);
 * `direct` = the browser calls the provider itself (BYOK, no server needed).
 */
export type Connection = "server" | "direct";

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
	connection: Connection;
	/** Where the browser reaches the local servers in direct mode (not secret). */
	directBaseUrls: Record<LocalProviderId, string>;
}

const STORAGE_KEY = "prestell.chat.settings";

/**
 * v1: no version field, docsMode defaulted to "off".
 * v2 (2026-09-07): docsMode defaults to "inject" (the evaluation showed it
 * removes hallucinations for every model). Stored "off" from v1 is migrated
 * because v1 saved the blob eagerly, so it was rarely a deliberate choice.
 * v3 (Phase 4): `connection` (server / direct) and `directBaseUrls`.
 */
export const SETTINGS_VERSION = 3;

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
	connection: "server",
	directBaseUrls: {
		ollama: DEFAULT_OLLAMA_BASE_URL,
		lmstudio: DEFAULT_LMSTUDIO_BASE_URL,
	},
};

function migrate(parsed: Partial<ChatSettings>): Partial<ChatSettings> {
	const version = typeof parsed.version === "number" ? parsed.version : 1;
	const next = { ...parsed };
	if (version < 2 && next.docsMode === "off") next.docsMode = "inject";
	if (next.connection !== "server" && next.connection !== "direct")
		next.connection = "server";
	return { ...next, version: SETTINGS_VERSION };
}

/** The connection a build pins, or null when the user may switch. */
export function lockedConnection(
	connections: AiConnections = AI_CONNECTIONS,
): Connection | null {
	return connections === "both" ? null : connections;
}

export function loadSettings(
	connections: AiConnections = AI_CONNECTIONS,
): ChatSettings {
	const locked = lockedConnection(connections);
	const withLock = (settings: ChatSettings): ChatSettings =>
		locked ? { ...settings, connection: locked } : settings;
	if (typeof localStorage === "undefined")
		return withLock({ ...DEFAULT_SETTINGS });
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return withLock({ ...DEFAULT_SETTINGS });
		const parsed = migrate(JSON.parse(raw) as Partial<ChatSettings>);
		return withLock({
			...DEFAULT_SETTINGS,
			...parsed,
			models: { ...(parsed.models ?? {}) },
			maxFixAttempts: clampFixAttempts(parsed.maxFixAttempts),
			directBaseUrls: {
				...DEFAULT_SETTINGS.directBaseUrls,
				...(parsed.directBaseUrls ?? {}),
			},
		});
	} catch {
		return withLock({ ...DEFAULT_SETTINGS });
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
