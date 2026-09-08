import { describe, expect, it } from "vitest";
import {
	addFile,
	basename,
	buildFileTree,
	checkUploadSize,
	deleteFile,
	entryCandidates,
	formatBytes,
	languageFor,
	MAX_UPLOAD_BYTES,
	projectBlobBytes,
	renameFile,
	sanitizeUploadName,
	templateForNewFile,
	uploadPathFor,
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

describe("uploads", () => {
	it("sanitises names and keeps them unique", () => {
		expect(sanitizeUploadName("My Photo (1).PNG")).toBe("my-photo-1.png");
		expect(sanitizeUploadName("...")).toBe("file");
		const files = { "public/images/logo.png": new Blob([]) };
		expect(uploadPathFor(files, "Logo.png")).toBe("public/images/logo-2.png");
		expect(uploadPathFor(files, "new.png")).toBe("public/images/new.png");
	});

	it("enforces the size limits", () => {
		const big = new Blob([new Uint8Array(19 * 1024 * 1024)]);
		const files = { "public/images/big.bin": big };
		expect(projectBlobBytes(files)).toBe(big.size);
		expect(checkUploadSize(files, MAX_UPLOAD_BYTES + 1)).toEqual({
			ok: false,
			error: "files.uploadTooLarge",
		});
		expect(checkUploadSize(files, MAX_UPLOAD_BYTES)).toEqual({
			ok: false,
			error: "files.projectTooLarge",
		});
		expect(checkUploadSize({}, MAX_UPLOAD_BYTES)).toEqual({ ok: true });
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(2048)).toBe("2.0 KB");
		expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
	});
});
