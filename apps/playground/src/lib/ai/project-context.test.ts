import { describe, expect, it } from "vitest";
import {
	importedPaths,
	projectContextOf,
	renderProjectFiles,
	selectProjectFiles,
} from "./project-context";
import { buildSystemPrompt } from "./prompt";

const files = {
	"src/pages/index.astro": `---\nimport Layout from '../layouts/Layout.astro';\nimport Card from '../components/Card.astro';\nimport '../styles/global.css';\n---\n<Layout><Card /></Layout>`,
	"src/layouts/Layout.astro": "<html><body><slot /></body></html>",
	"src/components/Card.astro": "<article>card</article>",
	"src/styles/global.css": "body {}",
	"src/pages/about.astro": "<p>about</p>",
	"public/images/logo.png": new Blob([new Uint8Array(2048)]),
};

describe("project context", () => {
	it("separates text files from assets", () => {
		const context = projectContextOf({
			mode: "site",
			entry: "src/pages/index.astro",
			files,
		});
		expect(Object.keys(context.files)).not.toContain("public/images/logo.png");
		expect(context.assets).toEqual([
			{ path: "public/images/logo.png", bytes: 2048 },
		]);
	});

	it("finds relative imports that exist", () => {
		const context = projectContextOf({
			mode: "site",
			entry: "src/pages/index.astro",
			files,
		});
		expect(
			importedPaths(
				"src/pages/index.astro",
				context.files["src/pages/index.astro"],
				context.files,
			),
		).toEqual([
			"src/layouts/Layout.astro",
			"src/components/Card.astro",
			"src/styles/global.css",
		]);
	});

	it("orders the open file and its imports first and respects the budget", () => {
		const context = projectContextOf({
			mode: "site",
			entry: "src/pages/index.astro",
			files,
		});
		const all = selectProjectFiles(context, "src/pages/about.astro", 100_000);
		expect(all.included.map((f) => f.path)).toEqual([
			"src/pages/about.astro",
			"src/pages/index.astro",
			"src/layouts/Layout.astro",
			"src/components/Card.astro",
			"src/styles/global.css",
		]);
		expect(all.omitted).toEqual([]);
		const tight = selectProjectFiles(context, "src/pages/about.astro", 60);
		expect(tight.included[0].path).toBe("src/pages/about.astro");
		expect(
			tight.included.reduce((n, f) => n + f.source.length, 0),
		).toBeLessThanOrEqual(60);
		expect(tight.omitted).toContain("src/pages/index.astro");
	});

	it("renders path-tagged fences, omitted files and assets", () => {
		const context = projectContextOf({
			mode: "page",
			entry: "src/pages/index.astro",
			files,
		});
		const text = renderProjectFiles(context, "src/pages/index.astro", 100_000);
		expect(text).toContain(
			"### src/pages/index.astro (open in the editor, preview entry)",
		);
		expect(text).toContain("```astro path=src/pages/index.astro");
		expect(text).toContain("```css path=src/styles/global.css");
		expect(text).toContain(
			"- public/images/logo.png → `/images/logo.png` (2 KB)",
		);
		const tight = renderProjectFiles(context, "src/pages/index.astro", 10);
		expect(tight).toContain("Other files (contents omitted");
	});

	it("switches the system prompt to the project contract", () => {
		const context = projectContextOf({
			mode: "site",
			entry: "src/pages/index.astro",
			files,
		});
		const prompt = buildSystemPrompt({
			filename: "src/pages/index.astro",
			source: context.files["src/pages/index.astro"],
			project: context,
		});
		expect(prompt).toContain("ONE fenced code block PER FILE");
		expect(prompt).toContain("## Project files");
		expect(prompt).not.toContain("No `import` / `export` statements");
		const single = buildSystemPrompt({
			filename: "Component.astro",
			source: "<p/>",
		});
		expect(single).toContain("ONE Astro component");
		expect(single).not.toContain("## Project files");
	});
});
