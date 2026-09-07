import { describe, expect, it } from "vitest";
import {
	directHelp,
	emptyDirectNote,
	KEY_URLS,
	keySavedLabel,
} from "./messages";
import { PROVIDER_IDS } from "./providers-catalog";

describe("direct-mode help", () => {
	it("links cloud providers to their key page and explains billing and storage", () => {
		const help = directHelp("anthropic", "http://localhost:4321");
		expect(help.link).toEqual({
			label: "Get an Anthropic API key",
			href: KEY_URLS.anthropic,
		});
		expect(help.link?.href).toMatch(/^https:\/\/console\.anthropic\.com\//);
		expect(help.points.join(" ")).toContain(
			"billing are tied to your own Anthropic account",
		);
		expect(help.points.join(" ")).toContain("sessionStorage");
		expect(KEY_URLS.openai).toMatch(/^https:\/\/platform\.openai\.com\//);
		expect(KEY_URLS.google).toMatch(/^https:\/\/aistudio\.google\.com\//);
	});

	it("gives local servers the CORS instruction instead of a key link", () => {
		const help = directHelp("lmstudio", "https://prestell.example");
		expect(help.link).toBeUndefined();
		expect(help.points.join(" ")).toContain("Nothing is billed");
		expect(help.points.join(" ")).toContain("lms server start --cors");
		const ollama = directHelp("ollama", "https://prestell.example");
		expect(ollama.points.join(" ")).toContain(
			"OLLAMA_ORIGINS=https://prestell.example",
		);
	});

	it("has text for every provider, including the server-only one", () => {
		for (const provider of PROVIDER_IDS) {
			expect(
				directHelp(provider, "http://localhost:4321").points.length,
			).toBeGreaterThan(0);
			expect(emptyDirectNote(provider)).toContain("Direct mode");
		}
		expect(
			directHelp("workers-ai", "http://localhost:4321").points[0],
		).toContain("Connection: Server");
	});
});

describe("keySavedLabel", () => {
	it("shows only the last four characters of a long key", () => {
		expect(keySavedLabel("sk-ant-api03-abcdefghijklmnop")).toBe(
			"Key saved for this tab (…mnop).",
		);
		expect(keySavedLabel("short")).toBe("Key saved for this tab.");
	});
});
