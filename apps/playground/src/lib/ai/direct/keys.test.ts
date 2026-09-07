import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetKeys, KEYS_STORAGE_KEY, loadKeys, saveKey } from "./keys";

class MemoryStorage {
	map = new Map<string, string>();
	getItem(key: string): string | null {
		return this.map.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}
	removeItem(key: string): void {
		this.map.delete(key);
	}
}

let storage: MemoryStorage;
beforeEach(() => {
	storage = new MemoryStorage();
	vi.stubGlobal("sessionStorage", storage);
	forgetKeys();
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("direct-mode keys", () => {
	it("keeps keys in sessionStorage only", () => {
		expect(saveKey("anthropic", "  sk-ant-test ")).toEqual({
			anthropic: "sk-ant-test",
		});
		expect(JSON.parse(storage.getItem(KEYS_STORAGE_KEY) ?? "{}")).toEqual({
			anthropic: "sk-ant-test",
		});
		expect(typeof localStorage).toBe("undefined");
	});

	it("restores keys from sessionStorage and drops unknown entries", () => {
		storage.setItem(
			KEYS_STORAGE_KEY,
			JSON.stringify({ openai: "sk-openai", bogus: "x", google: 42 }),
		);
		expect(loadKeys()).toEqual({ openai: "sk-openai" });
	});

	it("removes the entry when the key is cleared and on forget", () => {
		saveKey("google", "AIza-test");
		saveKey("google", "");
		expect(loadKeys()).toEqual({});
		expect(storage.getItem(KEYS_STORAGE_KEY)).toBeNull();
		saveKey("openai", "sk-1");
		expect(forgetKeys()).toEqual({});
		expect(storage.getItem(KEYS_STORAGE_KEY)).toBeNull();
	});

	it("works in memory when sessionStorage is unavailable", () => {
		vi.stubGlobal("sessionStorage", undefined);
		expect(saveKey("anthropic", "sk-mem")).toEqual({ anthropic: "sk-mem" });
		expect(loadKeys()).toEqual({ anthropic: "sk-mem" });
	});
});
