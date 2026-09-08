import { describe, expect, it } from "vitest";
import {
	extractAstroCode,
	extractProposalFiles,
	stripAstroFences,
	stripCodeFences,
} from "./extract-code";

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

describe("extractProposalFiles", () => {
	it("collects path-tagged fences of any file language", () => {
		const text = [
			"Here:",
			"```astro path=src/pages/index.astro",
			"<h1>a</h1>",
			"```",
			"and",
			"```css path=./src/styles/global.css",
			"body {}",
			"```",
			"```bash",
			"npm run dev",
			"```",
		].join("\n");
		expect(extractProposalFiles(text, "src/pages/index.astro")).toEqual({
			files: [
				{ path: "src/pages/index.astro", code: "<h1>a</h1>", complete: true },
				{ path: "src/styles/global.css", code: "body {}", complete: true },
			],
			complete: true,
		});
	});

	it("takes the last block for a repeated path and flags streaming", () => {
		const text =
			"```astro path=a.astro\n<p>1</p>\n```\n```astro path=a.astro\n<p>2</p>";
		expect(extractProposalFiles(text, "x.astro")).toEqual({
			files: [{ path: "a.astro", code: "<p>2</p>", complete: false }],
			complete: false,
		});
	});

	it("falls back to the open file for an untagged astro fence", () => {
		const text = "```astro\n<p>x</p>\n```";
		expect(extractProposalFiles(text, "src/pages/index.astro")).toEqual({
			files: [
				{ path: "src/pages/index.astro", code: "<p>x</p>", complete: true },
			],
			complete: true,
		});
		expect(extractProposalFiles("prose only", "x.astro")).toBeNull();
	});

	it("accepts file= / title= attributes and quotes", () => {
		const text = '```astro file="src/components/Card.astro"\n<p/>\n```';
		expect(extractProposalFiles(text, "x")?.files[0].path).toBe(
			"src/components/Card.astro",
		);
	});
});

describe("stripCodeFences", () => {
	it("removes file fences but keeps other code", () => {
		const text =
			"Intro\n```astro path=a.astro\n<p/>\n```\nRun:\n```bash\nnpm i\n```\nEnd";
		expect(stripCodeFences(text)).toBe(
			"Intro\n\nRun:\n```bash\nnpm i\n```\nEnd",
		);
	});
});
