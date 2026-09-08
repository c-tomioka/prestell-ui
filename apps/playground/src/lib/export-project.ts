// Export a Page / Site project as an Astro project: the project's `src/` and
// `public/` files plus the scaffolding (`package.json`, `astro.config.mjs`,
// `tsconfig.json`, …), written either as a ZIP download or straight into a
// directory chosen with the File System Access API.
import type { ProjectFile, ProjectRecord } from "./projects/types";
import { createZip, type ZipEntry } from "./zip";

/** Astro version pinned in the exported `package.json` (the one this app renders with). */
export const EXPORT_ASTRO_VERSION = "^7.2.0";

export function projectSlug(name: string): string {
	const slug = name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "astro-site";
}

export interface ScaffoldOptions {
	name: string;
	astroVersion?: string;
}

/** Files added around the project's own `src/` and `public/`. */
export function scaffoldFiles(
	options: ScaffoldOptions,
): Record<string, string> {
	const slug = projectSlug(options.name);
	const astroVersion = options.astroVersion ?? EXPORT_ASTRO_VERSION;
	return {
		"package.json": `${JSON.stringify(
			{
				name: slug,
				type: "module",
				version: "0.0.1",
				private: true,
				scripts: {
					dev: "astro dev",
					build: "astro build",
					preview: "astro preview",
					astro: "astro",
				},
				dependencies: { astro: astroVersion },
			},
			null,
			2,
		)}\n`,
		"astro.config.mjs": `// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({});
`,
		"tsconfig.json": `${JSON.stringify(
			{
				extends: "astro/tsconfigs/base",
				include: [".astro/types.d.ts", "**/*"],
				exclude: ["dist"],
			},
			null,
			2,
		)}\n`,
		".gitignore": `# build output
dist/
# generated types
.astro/
# dependencies
node_modules/
# environment variables
.env
.env.production
# macOS
.DS_Store
`,
		"README.md": `# ${options.name}

Exported from [Prestell UI](https://github.com/c-tomioka/prestell-ui).

\`\`\`sh
npm install
npm run dev
\`\`\`

- \`src/pages/\` – pages (each file is a route)
- \`src/layouts/\`, \`src/components/\` – layouts and components
- \`src/styles/\` – global CSS
- \`public/\` – static assets served as-is
`,
	};
}

/**
 * Everything that goes into the export, keyed by path. Project files win over
 * the scaffold so a project may carry its own `README.md` if it ever does.
 */
export function projectArchiveFiles(
	record: Pick<ProjectRecord, "name" | "files">,
): Record<string, ProjectFile> {
	return { ...scaffoldFiles({ name: record.name }), ...record.files };
}

async function toBytes(content: ProjectFile): Promise<Uint8Array> {
	if (typeof content === "string") return new TextEncoder().encode(content);
	return new Uint8Array(await content.arrayBuffer());
}

/** ZIP archive of the project with the scaffold, as a Blob. */
export async function projectZip(
	record: Pick<ProjectRecord, "name" | "files">,
): Promise<Blob> {
	const entries: ZipEntry[] = [];
	const files = projectArchiveFiles(record);
	for (const path of Object.keys(files).sort()) {
		entries.push({ path, data: await toBytes(files[path]) });
	}
	const bytes = createZip(entries);
	return new Blob([bytes as BlobPart], { type: "application/zip" });
}

export function zipFilename(name: string): string {
	return `${projectSlug(name)}.zip`;
}

// --- File System Access API (Chromium) --------------------------------------

interface WritableLike {
	write(data: string | Blob | Uint8Array): Promise<void>;
	close(): Promise<void>;
}

export interface DirectoryHandleLike {
	getDirectoryHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<DirectoryHandleLike>;
	getFileHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<{ createWritable(): Promise<WritableLike> }>;
}

type ShowDirectoryPicker = (options?: {
	mode?: "read" | "readwrite";
}) => Promise<DirectoryHandleLike>;

function directoryPicker(): ShowDirectoryPicker | undefined {
	if (typeof window === "undefined") return undefined;
	const picker = (
		window as unknown as { showDirectoryPicker?: ShowDirectoryPicker }
	).showDirectoryPicker;
	return typeof picker === "function" ? picker.bind(window) : undefined;
}

export function supportsDirectoryExport(): boolean {
	return directoryPicker() !== undefined;
}

/** Write every file under `root`, creating folders as needed. */
export async function writeFilesTo(
	root: DirectoryHandleLike,
	files: Record<string, ProjectFile>,
): Promise<void> {
	for (const [path, content] of Object.entries(files)) {
		const segments = path.split("/");
		const filename = segments.pop() as string;
		let dir = root;
		for (const segment of segments) {
			dir = await dir.getDirectoryHandle(segment, { create: true });
		}
		const handle = await dir.getFileHandle(filename, { create: true });
		const writable = await handle.createWritable();
		await writable.write(
			typeof content === "string"
				? content
				: await content.arrayBuffer().then((b) => new Uint8Array(b)),
		);
		await writable.close();
	}
}

export type ExportResult = "saved" | "downloaded" | "cancelled";

/** Let the user pick a folder and write the project into it. */
export async function exportProjectToDirectory(
	record: Pick<ProjectRecord, "name" | "files">,
): Promise<ExportResult> {
	const picker = directoryPicker();
	if (!picker) return exportProjectAsZip(record);
	try {
		const root = await picker({ mode: "readwrite" });
		await writeFilesTo(root, projectArchiveFiles(record));
		return "saved";
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return "cancelled";
		}
		throw error;
	}
}

/** Download the project as a ZIP. */
export async function exportProjectAsZip(
	record: Pick<ProjectRecord, "name" | "files">,
): Promise<ExportResult> {
	const blob = await projectZip(record);
	const url = URL.createObjectURL(blob);
	try {
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = zipFilename(record.name);
		anchor.rel = "noopener";
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
	} finally {
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	return "downloaded";
}
