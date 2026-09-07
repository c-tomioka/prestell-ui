import { compileAstroSync, parseAstroSync } from "@astrojs/compiler-binding";
import { describe, expect, it } from "vitest";
import { validatePreview } from "../preview";
import { buildPreviewGraph, type PreviewFiles } from "../preview-graph";
import { validateFilePath } from "./files";
import {
	componentNameFor,
	createPreset,
	DEFAULT_COMPONENT_FILENAME,
	PAGE_ENTRY,
	promoteToPage,
} from "./presets";
import { createProjectRecord } from "./record";
import type { ProjectMode } from "./types";

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

/** Every preset must build a preview graph from every page without errors. */
async function expectRenderable(
	files: PreviewFiles,
	entry: string,
	mode: ProjectMode,
) {
	const graph = await buildPreviewGraph({
		entry,
		files,
		compile,
		validate: validatePreview,
		allowImports: mode !== "component",
	});
	expect(graph.modules.at(-1)?.moduleId).toBe(entry);
	return graph;
}

describe("presets", () => {
	it.each(["component", "page", "site"] as const)(
		"%s preset has valid paths and renders",
		async (mode) => {
			const preset = createPreset(mode);
			for (const path of Object.keys(preset.files)) {
				expect(validateFilePath(path, mode)).toEqual({ path });
			}
			expect(preset.files).toHaveProperty(preset.entry);
			const pages = Object.keys(preset.files).filter(
				(path) => path.startsWith("src/pages/") || mode === "component",
			);
			for (const page of pages) {
				await expectRenderable(preset.files, page, mode);
			}
		},
	);

	it("uses the documented entry files", () => {
		expect(createPreset("component").entry).toBe(DEFAULT_COMPONENT_FILENAME);
		expect(createPreset("page").entry).toBe(PAGE_ENTRY);
		expect(Object.keys(createPreset("site").files)).toHaveLength(6);
	});
});

describe("promoteToPage", () => {
	it("moves the component under src/components and renders it from a layout", async () => {
		const record = createProjectRecord({
			name: "Card",
			mode: "component",
			entry: "pricing-card.astro",
			files: {
				"pricing-card.astro": `---\nconst { title = 'Plan' } = Astro.props;\n---\n<article>{title}</article>`,
			},
		});
		const promoted = promoteToPage(record);
		expect(promoted.id).toBe(record.id);
		expect(promoted.mode).toBe("page");
		expect(promoted.entry).toBe(PAGE_ENTRY);
		expect(Object.keys(promoted.files).sort()).toEqual([
			"src/components/PricingCard.astro",
			"src/layouts/Layout.astro",
			"src/pages/index.astro",
		]);
		expect(promoted.files[PAGE_ENTRY]).toContain("<PricingCard />");
		const graph = await expectRenderable(promoted.files, PAGE_ENTRY, "page");
		expect(graph.modules).toHaveLength(3);
	});

	it("derives component names", () => {
		expect(componentNameFor("Component.astro")).toBe("Component");
		expect(componentNameFor("my-hero_section.astro")).toBe("MyHeroSection");
		expect(componentNameFor("123.astro")).toBe("Component");
	});
});
