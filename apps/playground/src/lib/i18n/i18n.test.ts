import { get } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";
import { en, type MessageKey } from "./en";
import {
	detectLocale,
	format,
	locale,
	setLocale,
	t,
	tr,
	translate,
} from "./index";
import { ja } from "./ja";

afterEach(() => locale.set("en"));

const keys = Object.keys(en) as MessageKey[];

describe("dictionaries", () => {
	it("define every key in both languages with non-empty text", () => {
		for (const key of keys) {
			expect(ja[key], key).toBeTypeOf("string");
			expect(ja[key].trim(), key).not.toBe("");
			expect(en[key].trim(), key).not.toBe("");
		}
		expect(Object.keys(ja).sort()).toEqual([...keys].sort());
	});

	it("use the same placeholders in both languages", () => {
		const names = (text: string) =>
			[...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
		for (const key of keys) {
			expect(names(ja[key]), key).toEqual(names(en[key]));
		}
	});
});

describe("format / translate", () => {
	it("fills placeholders and leaves unknown ones visible", () => {
		expect(format("Retry with {provider}", { provider: "Ollama" })).toBe(
			"Retry with Ollama",
		);
		expect(format("{a} and {b}", { a: 1 })).toBe("1 and {b}");
		expect(translate("ja", "chat.retryWith", { provider: "Ollama" })).toBe(
			"Ollama で再試行",
		);
	});
});

describe("detectLocale", () => {
	it("prefers the stored choice, then the browser language", () => {
		expect(detectLocale("ja", "en-US")).toBe("ja");
		expect(detectLocale("bogus", "ja-JP")).toBe("ja");
		expect(detectLocale(null, "ja")).toBe("ja");
		expect(detectLocale(null, "en-GB")).toBe("en");
		expect(detectLocale(undefined, undefined)).toBe("en");
	});
});

describe("stores", () => {
	it("switches the reactive and the plain translator together", () => {
		expect(get(t)("chat.title")).toBe("AI chat");
		expect(tr("chat.title")).toBe("AI chat");
		setLocale("ja");
		expect(get(t)("chat.title")).toBe("AI チャット");
		expect(tr("chat.title")).toBe("AI チャット");
	});
});
