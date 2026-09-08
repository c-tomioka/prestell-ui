import { compileAstroSync, parseAstroSync } from "@astrojs/compiler-binding";
import { describe, expect, it } from "vitest";
import { validatePreview } from "./preview";
import {
	buildPreviewGraph,
	normalizePath,
	type PreviewFiles,
	PreviewUnsupportedError,
	resolveProjectImport,
	resolveRelativeImport,
} from "./preview-graph";
import { createManifest } from "./preview-manifest";

const compile = async (path: string, text: string) => ({
	result: compileAstroSync(text, {
		filename: path,
		internalURL: "./runtime.js",
		resolvePathProvided: true,
	}),
	ast: (() => {
		const parsed = parseAstroSync(text);
		return { ast: JSON.parse(parsed.ast), diagnostics: parsed.diagnostics };
	})(),
});

function build(files: PreviewFiles, entry = "src/pages/index.astro") {
	return buildPreviewGraph({
		entry,
		files,
		compile,
		validate: validatePreview,
		allowImports: true,
	});
}

const site: PreviewFiles = {
	"src/pages/index.astro": `---
import Layout from '../layouts/Layout.astro';
import Card from '../components/Card.astro';
import '../styles/global.css';
---
<Layout title="Home"><Card /><Card /></Layout>
<style>h1 { color: red }</style>
<script>console.log('page')</script>`,
	"src/layouts/Layout.astro": `---
import '../styles/global.css';
const { title } = Astro.props;
---
<html><head><title>{title}</title></head><body><slot /></body></html>
<style is:global>body { margin: 0 }</style>
<script>console.log('layout')</script>`,
	"src/components/Card.astro": `<article class="card">hi</article>
<style>.card { border: 1px solid }</style>`,
	"src/styles/global.css": ":root { --x: 1 }",
};

describe("path helpers", () => {
	it("normalises paths", () => {
		expect(normalizePath("./src/./pages//index.astro")).toBe(
			"src/pages/index.astro",
		);
		expect(normalizePath("/src/a/../b.astro")).toBe("src/b.astro");
		expect(normalizePath("../x.astro")).toBeNull();
	});

	it("resolves relative specifiers against the importer", () => {
		expect(
			resolveRelativeImport("src/pages/index.astro", "../layouts/L.astro"),
		).toBe("src/layouts/L.astro");
		expect(resolveRelativeImport("Component.astro", "./Card.astro")).toBe(
			"Card.astro",
		);
		expect(
			resolveRelativeImport("src/pages/index.astro", "astro:content"),
		).toBe(null);
		expect(resolveRelativeImport("a.astro", "../../b.astro")).toBeNull();
	});

	it("only accepts existing .astro / .css project files", () => {
		const files: PreviewFiles = {
			"src/pages/index.astro": "",
			"src/x.css": "",
			"src/data.json": "{}",
			"public/logo.png": new Blob([]),
		};
		const from = "src/pages/index.astro";
		expect(resolveProjectImport(files, from, "../x.css")).toEqual({
			path: "src/x.css",
		});
		expect(resolveProjectImport(files, from, "astro:content")).toEqual({
			error: expect.stringContaining("Only relative imports"),
		});
		expect(resolveProjectImport(files, from, "./missing.astro")).toEqual({
			error: expect.stringContaining('Cannot resolve "./missing.astro"'),
		});
		expect(resolveProjectImport(files, from, "../data.json")).toEqual({
			error: expect.stringContaining("only .astro and .css"),
		});
		expect(resolveProjectImport(files, from, "../../public/logo.png")).toEqual({
			error: expect.stringContaining("only .astro and .css"),
		});
	});
});

describe("buildPreviewGraph", () => {
	it("compiles the entry and its dependencies, dependencies first", async () => {
		const graph = await build(site);
		expect(graph.modules.map((m) => [m.id, m.moduleId])).toEqual([
			["module-1.js", "src/layouts/Layout.astro"],
			["module-2.js", "src/components/Card.astro"],
			["component.js", "src/pages/index.astro"],
		]);
		const entry = graph.modules[2].code;
		expect(entry).toContain('from "./module-1.js"');
		expect(entry).toContain('from "./module-2.js"');
		expect(entry).toContain('from "./runtime.js"');
		expect(entry).not.toContain(".css");
		expect(entry).not.toContain("astro&type=style");
		expect(graph.modules[0].containsHead).toBe(true);
		expect(graph.modules[0].scripts).toEqual([
			{ type: "inline", code: 'console.log("layout");' },
		]);
	});

	it("collects CSS once per file in dependency order", async () => {
		const graph = await build(site);
		expect(graph.css).toEqual([
			":root { --x: 1 }",
			"body { margin: 0 }",
			expect.stringContaining(".card"),
			expect.stringContaining("h1"),
		]);
	});

	it("produces a manifest with metadata and scripts for every module", async () => {
		const graph = await build(site);
		const manifest = createManifest(graph.modules) as unknown as {
			componentMetadata: Map<string, { containsHead: boolean }>;
			inlinedScripts: Map<string, string>;
		};
		expect(
			manifest.componentMetadata.get("src/layouts/Layout.astro")?.containsHead,
		).toBe(true);
		expect(
			manifest.componentMetadata.get("src/pages/index.astro")?.containsHead,
		).toBe(false);
		expect([...manifest.inlinedScripts.values()]).toEqual([
			'console.log("layout");',
			'console.log("page");',
		]);
	});

	it("keeps Component mode self-contained", async () => {
		await expect(
			buildPreviewGraph({
				entry: "src/pages/index.astro",
				files: site,
				compile,
				validate: validatePreview,
				allowImports: false,
			}),
		).rejects.toThrow(
			"Imports are not supported in Preview: ../layouts/Layout.astro",
		);
	});

	it("rejects circular imports with the chain", async () => {
		const files: PreviewFiles = {
			"a.astro": `---\nimport B from './b.astro';\n---\n<B />`,
			"b.astro": `---\nimport A from './a.astro';\n---\n<A />`,
		};
		const failure = build(files, "a.astro");
		await expect(failure).rejects.toBeInstanceOf(PreviewUnsupportedError);
		await expect(failure).rejects.toThrow(
			"Circular imports are not supported in Preview: a.astro → b.astro → a.astro",
		);
	});

	it("names the file when a dependency is the problem", async () => {
		const files: PreviewFiles = {
			"a.astro": `---\nimport B from './b.astro';\n---\n<B />`,
			"b.astro": `---\nimport x from 'astro:content';\n---\n<p />`,
		};
		await expect(build(files, "a.astro")).rejects.toThrow(
			"b.astro: Only relative imports of project files (./, ../) are supported in Preview: astro:content",
		);
		await expect(
			build({ ...files, "b.astro": "<p>{</p>" }, "a.astro"),
		).rejects.toThrow("b.astro: Fix compiler errors");
	});

	it("rejects a missing entry", async () => {
		await expect(build({}, "x.astro")).rejects.toThrow(
			"The entry file x.astro does not exist",
		);
	});
});
