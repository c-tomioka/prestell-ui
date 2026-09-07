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

	it("adds the direct-mode fields when migrating a v2 blob", () => {
		storage.setItem(
			KEY,
			JSON.stringify({ version: 2, provider: "anthropic", docsMode: "tools" }),
		);
		const settings = loadSettings();
		expect(settings.version).toBe(SETTINGS_VERSION);
		expect(settings.connection).toBe("server");
		expect(settings.directBaseUrls).toEqual(DEFAULT_SETTINGS.directBaseUrls);
		expect(settings.provider).toBe("anthropic");
	});

	it("keeps a custom local URL and rejects an unknown connection value", () => {
		storage.setItem(
			KEY,
			JSON.stringify({
				version: 3,
				connection: "bogus",
				directBaseUrls: { ollama: "http://box:11434/v1" },
			}),
		);
		const settings = loadSettings();
		expect(settings.connection).toBe("server");
		expect(settings.directBaseUrls).toEqual({
			ollama: "http://box:11434/v1",
			lmstudio: DEFAULT_SETTINGS.directBaseUrls.lmstudio,
		});
	});

	it("pins the connection when the build offers only one", () => {
		saveSettings({ ...DEFAULT_SETTINGS, connection: "server" });
		expect(loadSettings("direct").connection).toBe("direct");
		expect(loadSettings("server").connection).toBe("server");
		expect(loadSettings("both").connection).toBe("server");
		expect(loadSettings("direct").provider).toBe(DEFAULT_SETTINGS.provider);
	});

	it("falls back to defaults on corrupt storage", () => {
		storage.setItem(KEY, "{not json");
		expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
	});
});
