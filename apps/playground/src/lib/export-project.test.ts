import { describe, expect, it } from "vitest";
import {
	type DirectoryHandleLike,
	projectArchiveFiles,
	projectSlug,
	projectZip,
	scaffoldFiles,
	writeFilesTo,
	zipFilename,
} from "./export-project";
import { crc32, createZip } from "./zip";

describe("zip", () => {
	it("computes the standard CRC-32", () => {
		expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array())).toBe(0);
	});

	it("writes stored entries with a central directory", () => {
		const bytes = createZip([
			{ path: "a.txt", data: new TextEncoder().encode("hello") },
			{ path: "dir/ü.txt", data: new Uint8Array([1, 2, 3]) },
		]);
		const view = new DataView(bytes.buffer);
		expect(view.getUint32(0, true)).toBe(0x04034b50);
		// End of central directory record is the last 22 bytes.
		const eocd = bytes.length - 22;
		expect(view.getUint32(eocd, true)).toBe(0x06054b50);
		expect(view.getUint16(eocd + 10, true)).toBe(2);
		const centralOffset = view.getUint32(eocd + 16, true);
		expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
		// UTF-8 flag and the first name are in place.
		expect(view.getUint16(6, true)).toBe(0x0800);
		expect(new TextDecoder().decode(bytes.slice(30, 35))).toBe("a.txt");
		expect(new TextDecoder().decode(bytes.slice(35, 40))).toBe("hello");
	});
});

describe("project export", () => {
	const record = {
		name: "My Landing Page!",
		files: {
			"src/pages/index.astro": "<h1>Hi</h1>",
			"public/logo.svg": "<svg/>",
		},
	};

	it("adds the Astro scaffold around the project files", () => {
		const files = projectArchiveFiles(record);
		expect(Object.keys(files).sort()).toEqual([
			".gitignore",
			"README.md",
			"astro.config.mjs",
			"package.json",
			"public/logo.svg",
			"src/pages/index.astro",
			"tsconfig.json",
		]);
		const pkg = JSON.parse(files["package.json"] as string);
		expect(pkg.name).toBe("my-landing-page");
		expect(pkg.dependencies.astro).toMatch(/^\^7\./);
		expect(pkg.scripts.dev).toBe("astro dev");
		expect(files["tsconfig.json"]).toContain("astro/tsconfigs/base");
		expect(projectSlug("   ")).toBe("astro-site");
		expect(zipFilename("Untitled 3")).toBe("untitled-3.zip");
		expect(
			scaffoldFiles({ name: "x", astroVersion: "^7.9.0" })["package.json"],
		).toContain('"astro": "^7.9.0"');
	});

	it("produces a zip blob", async () => {
		const blob = await projectZip(record);
		expect(blob.type).toBe("application/zip");
		const bytes = new Uint8Array(await blob.arrayBuffer());
		expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
	});

	it("writes nested folders through a directory handle", async () => {
		const written: Record<string, string> = {};
		const dir = (prefix: string): DirectoryHandleLike => ({
			getDirectoryHandle: async (name) => dir(`${prefix}${name}/`),
			getFileHandle: async (name) => ({
				createWritable: async () => ({
					write: async (data) => {
						written[`${prefix}${name}`] =
							typeof data === "string"
								? data
								: `<${(data as Uint8Array).length} bytes>`;
					},
					close: async () => {},
				}),
			}),
		});
		await writeFilesTo(dir(""), {
			"src/pages/index.astro": "<p/>",
			"public/img/a.png": new Blob([new Uint8Array(4)]),
		});
		expect(written).toEqual({
			"src/pages/index.astro": "<p/>",
			"public/img/a.png": "<4 bytes>",
		});
	});
});
