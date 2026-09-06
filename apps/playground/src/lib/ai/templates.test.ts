import { describe, expect, it } from "vitest";
import {
	firstPlaceholder,
	insertTemplate,
	PROMPT_TEMPLATES,
	templatesByCategory,
} from "./templates";

describe("PROMPT_TEMPLATES", () => {
	it("has unique ids and non-empty prompts", () => {
		const ids = PROMPT_TEMPLATES.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const t of PROMPT_TEMPLATES) {
			expect(t.label.trim()).not.toBe("");
			expect(t.prompt.trim()).not.toBe("");
		}
	});

	it("covers every category", () => {
		for (const group of templatesByCategory()) {
			expect(group.templates.length, group.category).toBeGreaterThan(0);
		}
	});

	it("style templates act on the current component and need no placeholders", () => {
		for (const t of PROMPT_TEMPLATES.filter((t) => t.category === "style")) {
			expect(t.prompt).toContain("current component");
			expect(firstPlaceholder(t.prompt)).toBeNull();
		}
	});
});

describe("firstPlaceholder", () => {
	it("finds the first [...] range", () => {
		expect(firstPlaceholder("Make a [thing] with [stuff]")).toEqual({
			start: 7,
			end: 14,
		});
	});

	it("returns null without a placeholder", () => {
		expect(firstPlaceholder("Plain text")).toBeNull();
		expect(firstPlaceholder("[]")).toBeNull();
	});
});

describe("insertTemplate", () => {
	const template = {
		id: "x",
		category: "component" as const,
		label: "X",
		prompt: "Build [a widget] now.",
	};

	it("replaces an empty composer and selects the placeholder", () => {
		expect(insertTemplate("", template)).toEqual({
			text: "Build [a widget] now.",
			selection: { start: 6, end: 16 },
		});
		expect(insertTemplate("   \n", template).text).toBe(
			"Build [a widget] now.",
		);
	});

	it("appends after a blank line and offsets the selection", () => {
		const result = insertTemplate("Hello  \n", template);
		expect(result.text).toBe("Hello\n\nBuild [a widget] now.");
		expect(result.selection).toEqual({ start: 13, end: 23 });
	});

	it("returns no selection when the template has no placeholder", () => {
		const plain = { ...template, prompt: "Make it blue." };
		expect(insertTemplate("", plain).selection).toBeNull();
	});
});
