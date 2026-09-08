// Pure helpers for the multi-file project model: path rules, the file tree
// shown on the left, and the immutable add / rename / delete operations.
import type { EditorLanguage } from "../codemirror";
import type { MessageKey } from "../i18n/en";
import { extensionOf, normalizePath } from "../preview-graph";
import type { ProjectFile, ProjectMode } from "./types";

/** Extensions the editor can hold as text; `.astro` must live under `src/`. */
export const TEXT_EXTENSIONS = [
	".astro",
	".css",
	".svg",
	".txt",
	".json",
	".xml",
	".html",
	".js",
	".webmanifest",
] as const;

/** Where files may live in Page / Site projects. */
export const PROJECT_ROOTS = ["src", "public"] as const;

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Checks a path the user typed. Returns the message key of the problem, or
 * null and the normalised path. Component mode only holds one top-level
 * `.astro` file; Page / Site keep everything under `src/` or `public/`.
 */
export function validateFilePath(
	input: string,
	mode: ProjectMode,
): { path: string } | { error: MessageKey } {
	const path = normalizePath(input.trim().replace(/\\/g, "/"));
	if (path === null || path === "") return { error: "files.invalidPath" };
	const segments = path.split("/");
	if (
		segments.some(
			(segment) =>
				!SEGMENT.test(segment) || segment === "." || segment === "..",
		)
	) {
		return { error: "files.invalidPath" };
	}
	const extension = extensionOf(path);
	if (mode === "component") {
		if (segments.length !== 1 || extension !== ".astro")
			return { error: "files.componentPath" };
		return { path };
	}
	if (!(TEXT_EXTENSIONS as readonly string[]).includes(extension))
		return { error: "files.unsupportedType" };
	if (!(PROJECT_ROOTS as readonly string[]).includes(segments[0]))
		return { error: "files.outsideRoots" };
	if (extension === ".astro" && segments[0] !== "src")
		return { error: "files.astroOutsideSrc" };
	return { path };
}

export function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

export function isPagePath(path: string): boolean {
	return path.startsWith("src/pages/") && extensionOf(path) === ".astro";
}

/**
 * `.astro` files that can be the preview entry: pages first (sorted), then
 * the rest, so the entry select reads naturally in Site mode.
 */
export function entryCandidates(files: Record<string, ProjectFile>): string[] {
	const astro = Object.keys(files)
		.filter((path) => extensionOf(path) === ".astro")
		.sort();
	return [
		...astro.filter((path) => isPagePath(path)),
		...astro.filter((path) => !isPagePath(path)),
	];
}

export function languageFor(path: string): EditorLanguage {
	switch (extensionOf(path)) {
		case ".astro":
			return "astro";
		case ".css":
			return "css";
		case ".json":
		case ".webmanifest":
			return "json";
		case ".js":
			return "javascript";
		default:
			return "text";
	}
}

export interface FileTreeNode {
	name: string;
	/** Full path for files; folder path (without trailing slash) for folders. */
	path: string;
	children?: FileTreeNode[];
}

/** Nested view of the file map: folders first, everything sorted by name. */
export function buildFileTree(
	files: Record<string, ProjectFile>,
): FileTreeNode[] {
	const root: FileTreeNode = { name: "", path: "", children: [] };
	for (const path of Object.keys(files).sort()) {
		const segments = path.split("/");
		let node = root;
		for (const [index, segment] of segments.entries()) {
			const isFile = index === segments.length - 1;
			const children = node.children as FileTreeNode[];
			let next = children.find(
				(child) => child.name === segment && Boolean(child.children) !== isFile,
			);
			if (!next) {
				next = isFile
					? { name: segment, path }
					: {
							name: segment,
							path: segments.slice(0, index + 1).join("/"),
							children: [],
						};
				children.push(next);
			}
			node = next;
		}
	}
	const sort = (nodes: FileTreeNode[]): FileTreeNode[] =>
		nodes
			.sort((a, b) => {
				if (Boolean(a.children) !== Boolean(b.children))
					return a.children ? -1 : 1;
				return a.name.localeCompare(b.name);
			})
			.map((node) =>
				node.children ? { ...node, children: sort(node.children) } : node,
			);
	return sort(root.children as FileTreeNode[]);
}

/** Starter contents for a file the user adds by path. */
export function templateForNewFile(path: string): string {
	switch (extensionOf(path)) {
		case ".astro": {
			const name = basename(path).replace(/\.astro$/, "");
			return `---\n// ${name}\n---\n<div class="${name.toLowerCase()}">\n\t<slot />\n</div>\n\n<style>\n\t.${name.toLowerCase()} {\n\t}\n</style>\n`;
		}
		case ".css":
			return `/* ${basename(path)} */\n`;
		case ".svg":
			return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n\t<circle cx="12" cy="12" r="9" />\n</svg>\n`;
		case ".json":
		case ".webmanifest":
			return "{}\n";
		default:
			return "";
	}
}

export function addFile(
	files: Record<string, ProjectFile>,
	path: string,
	content: ProjectFile,
): Record<string, ProjectFile> {
	return { ...files, [path]: content };
}

export function renameFile(
	files: Record<string, ProjectFile>,
	from: string,
	to: string,
): Record<string, ProjectFile> {
	const next: Record<string, ProjectFile> = {};
	for (const [path, content] of Object.entries(files)) {
		next[path === from ? to : path] = content;
	}
	return next;
}

export function deleteFile(
	files: Record<string, ProjectFile>,
	path: string,
): Record<string, ProjectFile> {
	const { [path]: _removed, ...rest } = files;
	return rest;
}

/** Upload limits (ROADMAP Phase 5): per file and per project, in bytes. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_PROJECT_BLOB_BYTES = 20 * 1024 * 1024;
/** Folder uploads land in. */
export const UPLOAD_DIR = "public/images";

/** Total size of the binary files in the project. */
export function projectBlobBytes(files: Record<string, ProjectFile>): number {
	let total = 0;
	for (const content of Object.values(files)) {
		if (content instanceof Blob) total += content.size;
	}
	return total;
}

/** `My Photo (1).PNG` → `my-photo-1.png`; keeps the extension. */
export function sanitizeUploadName(name: string): string {
	const dot = name.lastIndexOf(".");
	const hasExtension = dot > 0 && dot < name.length - 1;
	const stem = hasExtension ? name.slice(0, dot) : name;
	const extension = hasExtension ? name.slice(dot).toLowerCase() : "";
	const slug = stem
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${slug || "file"}${extension.replace(/[^a-z0-9.]/g, "")}`;
}

/** Path for an uploaded file, made unique against the existing files. */
export function uploadPathFor(
	files: Record<string, ProjectFile>,
	name: string,
	dir = UPLOAD_DIR,
): string {
	const clean = sanitizeUploadName(name);
	const dot = clean.lastIndexOf(".");
	const stem = dot > 0 ? clean.slice(0, dot) : clean;
	const extension = dot > 0 ? clean.slice(dot) : "";
	let path = `${dir}/${clean}`;
	for (let n = 2; path in files; n++) path = `${dir}/${stem}-${n}${extension}`;
	return path;
}

export type UploadCheck =
	| { ok: true }
	| { ok: false; error: "files.uploadTooLarge" | "files.projectTooLarge" };

/** Whether `size` more bytes fit within the limits. */
export function checkUploadSize(
	files: Record<string, ProjectFile>,
	size: number,
): UploadCheck {
	if (size > MAX_UPLOAD_BYTES)
		return { ok: false, error: "files.uploadTooLarge" };
	if (projectBlobBytes(files) + size > MAX_PROJECT_BLOB_BYTES)
		return { ok: false, error: "files.projectTooLarge" };
	return { ok: true };
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
