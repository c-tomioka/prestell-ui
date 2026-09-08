// What the model is told about a Page / Site project: the text files (with a
// character budget, the open file and its imports first) and the uploaded
// binaries by path. Pure so both transports and the eval harness share it.

import { resolveRelativeImport } from "../preview-graph";
import { basename } from "../projects/files";
import type { ProjectFile, ProjectMode } from "../projects/types";

export interface ProjectAsset {
	path: string;
	bytes: number;
}

/** Sent with every request in Page / Site mode (`ChatRequest.project`). */
export interface ProjectContext {
	mode: Exclude<ProjectMode, "component">;
	/** Path the preview renders. */
	entry: string;
	/** Text files by path. */
	files: Record<string, string>;
	/** Binary files under `public/` (not sent, only listed). */
	assets: ProjectAsset[];
}

/** Split a project's files into text (sent) and binaries (listed). */
export function projectContextOf(input: {
	mode: ProjectContext["mode"];
	entry: string;
	files: Readonly<Record<string, ProjectFile>>;
}): ProjectContext {
	const files: Record<string, string> = {};
	const assets: ProjectAsset[] = [];
	for (const [path, content] of Object.entries(input.files)) {
		if (typeof content === "string") files[path] = content;
		else assets.push({ path, bytes: content.size });
	}
	return { mode: input.mode, entry: input.entry, files, assets };
}

const IMPORT_SPECIFIER =
	/\bfrom\s+["'](\.\.?\/[^"']+)["']|^\s*import\s+["'](\.\.?\/[^"']+)["']/gm;

/** Paths a file imports relatively (existing project files only). */
export function importedPaths(
	path: string,
	source: string,
	files: Record<string, string>,
): string[] {
	const found: string[] = [];
	for (const match of source.matchAll(IMPORT_SPECIFIER)) {
		const specifier = match[1] ?? match[2];
		const resolved = specifier ? resolveRelativeImport(path, specifier) : null;
		if (resolved && resolved in files && !found.includes(resolved))
			found.push(resolved);
	}
	return found;
}

export interface SelectedFile {
	path: string;
	source: string;
}

/**
 * Files to include verbatim, most relevant first: the open file, what it
 * imports, the entry page and its imports, then the rest by path. Files that
 * do not fit in `budget` characters are returned in `omitted`.
 */
export function selectProjectFiles(
	project: ProjectContext,
	active: string,
	budget: number,
): { included: SelectedFile[]; omitted: string[] } {
	const order: string[] = [];
	const push = (path: string) => {
		if (path in project.files && !order.includes(path)) order.push(path);
	};
	const pushWithImports = (path: string) => {
		push(path);
		const source = project.files[path];
		if (source)
			for (const dep of importedPaths(path, source, project.files)) push(dep);
	};
	pushWithImports(active);
	pushWithImports(project.entry);
	for (const path of Object.keys(project.files).sort()) push(path);

	const included: SelectedFile[] = [];
	const omitted: string[] = [];
	let used = 0;
	for (const path of order) {
		const source = project.files[path];
		if (used + source.length <= budget) {
			included.push({ path, source });
			used += source.length;
		} else {
			omitted.push(path);
		}
	}
	return { included, omitted };
}

function fenceLanguage(path: string): string {
	const name = basename(path);
	const dot = name.lastIndexOf(".");
	const extension = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
	switch (extension) {
		case "astro":
			return "astro";
		case "css":
			return "css";
		case "svg":
		case "html":
		case "xml":
			return "html";
		case "json":
		case "webmanifest":
			return "json";
		case "js":
			return "js";
		default:
			return "text";
	}
}

/** The "## Project files" section of the system prompt. */
export function renderProjectFiles(
	project: ProjectContext,
	active: string,
	budget: number,
): string {
	const { included, omitted } = selectProjectFiles(project, active, budget);
	const lines: string[] = [];
	for (const file of included) {
		const notes: string[] = [];
		if (file.path === active) notes.push("open in the editor");
		if (file.path === project.entry) notes.push("preview entry");
		lines.push(
			`### ${file.path}${notes.length ? ` (${notes.join(", ")})` : ""}`,
			`\`\`\`${fenceLanguage(file.path)} path=${file.path}`,
			file.source,
			"```",
			"",
		);
	}
	if (omitted.length > 0) {
		lines.push(
			"### Other files (contents omitted to save space; ask to see one if needed)",
			...omitted.map((path) => `- ${path}`),
			"",
		);
	}
	if (project.assets.length > 0) {
		lines.push(
			"### Uploaded files under public/ (reference them by URL)",
			...project.assets.map(
				(asset) =>
					`- ${asset.path} → \`/${asset.path.replace(/^public\//, "")}\` (${Math.max(1, Math.round(asset.bytes / 1024))} KB)`,
			),
			"",
		);
	}
	return lines.join("\n").trimEnd();
}
