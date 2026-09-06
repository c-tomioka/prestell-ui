import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_SETTINGS,
	loadSettings,
	SETTINGS_VERSION,
	saveSettings,
} from "./settings";

const KEY = "prestell.chat.settings";

class MemoryStorage {
	private map = new Map<string, string>();
	getItem(key: string): string | null {
		return this.map.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}
	removeItem(key: string): void {
		this.map.delete(key);
	}
	clear(): void {
		this.map.clear();
	}
}

let storage: MemoryStorage;
beforeEach(() => {
	storage = new MemoryStorage();
	vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("loadSettings", () => {
	it("defaults docsMode to inject on a fresh browser", () => {
		expect(loadSettings().docsMode).toBe("inject");
		expect(loadSettings().version).toBe(SETTINGS_VERSION);
	});

	it("migrates a v1 blob that stored off to inject", () => {
		storage.setItem(
			KEY,
			JSON.stringify({ provider: "ollama", docsMode: "off" }),
		);
		const settings = loadSettings();
		expect(settings.docsMode).toBe("inject");
		expect(settings.version).toBe(SETTINGS_VERSION);
		expect(settings.provider).toBe("ollama");
	});

	it("keeps a v1 choice other than off", () => {
		storage.setItem(KEY, JSON.stringify({ docsMode: "tools" }));
		expect(loadSettings().docsMode).toBe("tools");
	});

	it("respects off once the blob is v2", () => {
		saveSettings({ ...DEFAULT_SETTINGS, docsMode: "off" });
		expect(loadSettings().docsMode).toBe("off");
		expect(loadSettings().version).toBe(SETTINGS_VERSION);
	});

	it("falls back to defaults on corrupt storage", () => {
		storage.setItem(KEY, "{not json");
		expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
	});
});
