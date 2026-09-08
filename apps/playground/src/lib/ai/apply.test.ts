import { compileAstroSync, parseAstroSync } from "@astrojs/compiler-binding";
import { describe, expect, it } from "vitest";
import type { PreviewCompiler } from "../preview-graph";
import { createPreset } from "../projects/presets";
import { validateProjectProposal } from "./apply";

const compile: PreviewCompiler = async (path, text) => ({
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

const page = createPreset("page");

describe("validateProjectProposal", () => {
	it("accepts a new component wired into the page", async () => {
		const result = await validateProjectProposal(
			{
				mode: "page",
				entry: page.entry,
				project: page.files,
				files: [
					{
						path: "src/components/Hero.astro",
						code: `---\nconst { title = 'Hi' } = Astro.props;\n---\n<section><h1>{title}</h1></section>`,
					},
					{
						path: page.entry,
						code: `---\nimport Layout from '../layouts/Layout.astro';\nimport Hero from '../components/Hero.astro';\n---\n<Layout><Hero /></Layout>`,
					},
				],
			},
			compile,
		);
		expect(result).toEqual({ ok: true, warnings: [] });
	});

	it("names the file for path, compile, import and graph problems", async () => {
		const bad = await validateProjectProposal(
			{
				mode: "page",
				entry: page.entry,
				project: page.files,
				files: [
					{ path: "components/Hero.astro", code: "<p/>" },
					{ path: "src/components/Broken.astro", code: "<p>{</p>" },
				],
			},
			compile,
		);
		expect(bad.ok).toBe(false);
		if (bad.ok) return;
		expect(bad.error).toContain(
			"components/Hero.astro: files must live under src/ or public/",
		);
		// Path problems are reported before anything is compiled.
		expect(bad.error).not.toContain("Broken");

		const broken = await validateProjectProposal(
			{
				mode: "page",
				entry: page.entry,
				project: page.files,
				files: [{ path: "src/components/Broken.astro", code: "<p>{</p>" }],
			},
			compile,
		);
		expect(broken.ok).toBe(false);
		if (!broken.ok)
			expect(broken.error).toMatch(/^src\/components\/Broken\.astro:/);

		const missing = await validateProjectProposal(
			{
				mode: "page",
				entry: page.entry,
				project: page.files,
				files: [
					{
						path: page.entry,
						code: `---\nimport Nope from '../components/Nope.astro';\n---\n<Nope />`,
					},
				],
			},
			compile,
		);
		expect(missing.ok).toBe(false);
		if (!missing.ok)
			expect(missing.error).toContain(
				'Cannot resolve "../components/Nope.astro"',
			);

		const bare = await validateProjectProposal(
			{
				mode: "site",
				entry: page.entry,
				project: page.files,
				files: [
					{
						path: "src/components/X.astro",
						code: `---\nimport { z } from 'astro:content';\n---\n<p/>`,
					},
				],
			},
			compile,
		);
		expect(bare.ok).toBe(false);
		if (!bare.ok)
			expect(bare.error).toContain(
				"src/components/X.astro: Only relative imports",
			);
	});

	it("rejects static HTML pages and public-only replies", async () => {
		const html = await validateProjectProposal(
			{
				mode: "site",
				entry: page.entry,
				project: page.files,
				files: [
					{ path: "public/index.html", code: "<!doctype html><h1>LP</h1>" },
				],
			},
			compile,
		);
		expect(html.ok).toBe(false);
		if (!html.ok)
			expect(html.error).toContain(
				"public/index.html: static HTML files are not part of an Astro site",
			);

		const publicOnly = await validateProjectProposal(
			{
				mode: "site",
				entry: page.entry,
				project: page.files,
				files: [{ path: "public/robots.txt", code: "User-agent: *" }],
			},
			compile,
		);
		expect(publicOnly.ok).toBe(false);
		if (!publicOnly.ok)
			expect(publicOnly.error).toContain("only adds files under public/");

		const withPage = await validateProjectProposal(
			{
				mode: "site",
				entry: page.entry,
				project: page.files,
				files: [
					{ path: "public/robots.txt", code: "User-agent: *" },
					{
						path: page.entry,
						code: `---\nimport Layout from '../layouts/Layout.astro';\n---\n<Layout><h1>ok</h1></Layout>`,
					},
				],
			},
			compile,
		);
		expect(withPage.ok).toBe(true);
	});

	it("rejects empty proposals", async () => {
		expect(
			await validateProjectProposal(
				{ mode: "page", entry: page.entry, project: page.files, files: [] },
				compile,
			),
		).toEqual({ ok: false, error: "The proposal is empty." });
	});
});
