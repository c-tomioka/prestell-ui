import { describe, expect, it } from "vitest";
import {
	addFile,
	basename,
	buildFileTree,
	deleteFile,
	entryCandidates,
	languageFor,
	renameFile,
	templateForNewFile,
	validateFilePath,
} from "./files";

describe("validateFilePath", () => {
	it("keeps Component projects to one top-level .astro file", () => {
		expect(validateFilePath(" Card.astro ", "component")).toEqual({
			path: "Card.astro",
		});
		expect(validateFilePath("src/Card.astro", "component")).toEqual({
			error: "files.componentPath",
		});
		expect(validateFilePath("card.css", "component")).toEqual({
			error: "files.componentPath",
		});
	});

	it("keeps Page / Site files under src/ or public/", () => {
		expect(validateFilePath("./src//components/Card.astro", "site")).toEqual({
			path: "src/components/Card.astro",
		});
		expect(validateFilePath("public\\images\\logo.svg", "page")).toEqual({
			path: "public/images/logo.svg",
		});
		expect(validateFilePath("Card.astro", "page")).toEqual({
			error: "files.outsideRoots",
		});
		expect(validateFilePath("public/Card.astro", "page")).toEqual({
			error: "files.astroOutsideSrc",
		});
		expect(validateFilePath("src/data.yaml", "page")).toEqual({
			error: "files.unsupportedType",
		});
		expect(validateFilePath("../src/x.astro", "page")).toEqual({
			error: "files.invalidPath",
		});
		expect(validateFilePath("src/a b.astro", "page")).toEqual({
			error: "files.invalidPath",
		});
		expect(validateFilePath("", "page")).toEqual({
			error: "files.invalidPath",
		});
	});
});

describe("file helpers", () => {
	const files = {
		"src/pages/index.astro": "",
		"src/pages/about.astro": "",
		"src/components/Card.astro": "",
		"src/styles/global.css": "",
		"public/logo.svg": "",
	};

	it("lists entry candidates with pages first", () => {
		expect(entryCandidates(files)).toEqual([
			"src/pages/about.astro",
			"src/pages/index.astro",
			"src/components/Card.astro",
		]);
	});

	it("builds a sorted tree, folders first", () => {
		const tree = buildFileTree(files);
		expect(tree.map((node) => node.name)).toEqual(["public", "src"]);
		const src = tree[1].children ?? [];
		expect(src.map((node) => node.name)).toEqual([
			"components",
			"pages",
			"styles",
		]);
		expect(src[1].children?.map((node) => node.path)).toEqual([
			"src/pages/about.astro",
			"src/pages/index.astro",
		]);
	});

	it("adds, renames and deletes immutably", () => {
		const added = addFile(files, "src/x.css", "a {}");
		expect(added["src/x.css"]).toBe("a {}");
		expect(files).not.toHaveProperty("src/x.css");
		const renamed = renameFile(added, "src/x.css", "src/styles/x.css");
		expect(Object.keys(renamed)).toContain("src/styles/x.css");
		expect(Object.keys(renamed)).not.toContain("src/x.css");
		const removed = deleteFile(renamed, "public/logo.svg");
		expect(Object.keys(removed)).not.toContain("public/logo.svg");
		expect(Object.keys(removed)).toHaveLength(5);
	});

	it("maps extensions to editor languages and templates", () => {
		expect(languageFor("src/pages/index.astro")).toBe("astro");
		expect(languageFor("src/styles/global.css")).toBe("css");
		expect(languageFor("public/site.webmanifest")).toBe("json");
		expect(languageFor("public/robots.txt")).toBe("text");
		expect(templateForNewFile("src/components/HeroBanner.astro")).toContain(
			'class="herobanner"',
		);
		expect(templateForNewFile("public/x.svg")).toContain("<svg");
		expect(templateForNewFile("public/robots.txt")).toBe("");
		expect(basename("src/pages/index.astro")).toBe("index.astro");
	});
});
