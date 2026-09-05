import { describe, expect, it } from "vitest";
import { extractAstroCode, stripAstroFences } from "./extract-code";

const component = "---\nconst a = 1;\n---\n<h1>{a}</h1>";

describe("extractAstroCode", () => {
	it("returns null when there is no astro fence", () => {
		expect(
			extractAstroCode("Just prose.\n```js\nconsole.log(1)\n```"),
		).toBeNull();
	});

	it("extracts a complete fence", () => {
		const text = `Here you go:\n\n\`\`\`astro\n${component}\n\`\`\`\n\nDone.`;
		expect(extractAstroCode(text)).toEqual({ code: component, complete: true });
	});

	it("prefers the longest complete fence (ignores trailing usage examples)", () => {
		const text = `\`\`\`astro\n${component}\n\`\`\`\nUse it like so:\n\`\`\`astro\n<Hero title="x" />\n\`\`\``;
		expect(extractAstroCode(text)?.code).toBe(component);
	});

	it("prefers the longest complete fence when the correction comes last", () => {
		const text = `\`\`\`astro\n<p>old</p>\n\`\`\`\nActually:\n\`\`\`astro\n${component}\n\`\`\``;
		expect(extractAstroCode(text)?.code).toBe(component);
	});

	it("keeps the complete component while a trailing block is still streaming", () => {
		const text = `\`\`\`astro\n${component}\n\`\`\`\nUsage:\n\`\`\`astro\n<Hero`;
		expect(extractAstroCode(text)).toEqual({ code: component, complete: true });
	});

	it("flags an unterminated fence while streaming", () => {
		const text = `\`\`\`astro\n---\nconst a = 1;\n---\n<h1>{a}`;
		expect(extractAstroCode(text)).toEqual({
			code: "---\nconst a = 1;\n---\n<h1>{a}",
			complete: false,
		});
	});

	it("accepts tildes and info strings", () => {
		const text = `~~~astro title="index.astro"\n${component}\n~~~`;
		expect(extractAstroCode(text)).toEqual({ code: component, complete: true });
	});

	it("does not treat backticks inside the component as a closing fence", () => {
		const inner = "---\nconst t = `x`;\n---\n<p>{t}</p>";
		const text = `\`\`\`astro\n${inner}\n\`\`\``;
		expect(extractAstroCode(text)?.code).toBe(inner);
	});
});

describe("stripAstroFences", () => {
	it("removes the fence and keeps the prose", () => {
		const text = `Intro.\n\n\`\`\`astro\n${component}\n\`\`\`\n\nOutro.`;
		expect(stripAstroFences(text)).toBe("Intro.\n\n\n\nOutro.");
	});

	it("removes an unterminated fence", () => {
		expect(stripAstroFences("Intro.\n```astro\n<p>")).toBe("Intro.");
	});
});
