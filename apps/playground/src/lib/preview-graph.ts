// Module graph for the preview: resolves the relative imports of an entry
// `.astro` file against the project's files, compiles every reachable `.astro`
// file, collects CSS, and rewrites the imports to flat module ids so both
// renderers can load the modules (Blob URLs in the browser, Worker Loader
// `modules` on the server). Pure apart from the injected `compile`.
//
// Supported imports (anything else is reported by `validatePreview`):
//   - `./x.astro`, `../y.astro`  → compiled and loaded as a module
//   - `./styles.css`             → dropped from the code, contents collected
// Circular imports are rejected: a Blob module needs its dependencies' URLs
// before it can be created.
import type { CompileResult } from "@astrojs/compiler-binding";
import type { ParsedAst } from "./compiler-protocol";
import {
	ENTRY_MODULE_ID,
	type PreviewModule,
	type PreviewRenderRequest,
} from "./preview-protocol";
import { RUNTIME_SPECIFIER, rewriteImports } from "./preview-rewrite";

/** Files of a project, keyed by normalised path (`src/pages/index.astro`). */
export type PreviewFiles = Readonly<Record<string, string | Blob>>;

export interface CompiledFile {
	result: CompileResult;
	ast: ParsedAst;
}

/**
 * Compiles one file for the preview. Must pass `filename: path` (so scope
 * hashes and `moduleId`s are unique per file), `internalURL: "./runtime.js"`
 * and `resolvePathProvided: true`.
 */
export type PreviewCompiler = (
	path: string,
	source: string,
) => Promise<CompiledFile>;

/** `null` when the import is fine, otherwise the message to show. */
export type ImportCheck = (specifier: string) => string | null;

export type PreviewValidator = (
	result: CompileResult,
	ast: ParsedAst,
	checkImport?: ImportCheck,
) => string | null;

/** The entry (or a dependency) uses something the preview cannot render. */
export class PreviewUnsupportedError extends Error {
	override readonly name = "PreviewUnsupportedError";
}

export interface PreviewGraph extends PreviewRenderRequest {
	/** Global (`.css` imports, `is:global`) and scoped CSS, dependencies first. */
	css: string[];
}

const STYLE_IMPORT = /\?astro&type=style&/;
const IMPORTABLE_EXTENSIONS = [".astro", ".css"];

/** `a/./b/../c` → `a/c`; leading `./` and `/` dropped. Null when it escapes the root. */
export function normalizePath(path: string): string | null {
	const parts: string[] = [];
	for (const part of path.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") {
			if (parts.length === 0) return null;
			parts.pop();
			continue;
		}
		parts.push(part);
	}
	return parts.join("/");
}

export function isRelativeSpecifier(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

/** Path a relative `specifier` names from `importer`; null when not relative or escaping the root. */
export function resolveRelativeImport(
	importer: string,
	specifier: string,
): string | null {
	if (!isRelativeSpecifier(specifier)) return null;
	const dir = importer.includes("/")
		? importer.slice(0, importer.lastIndexOf("/") + 1)
		: "";
	return normalizePath(`${dir}${specifier}`);
}

export function extensionOf(path: string): string {
	const base = path.slice(path.lastIndexOf("/") + 1);
	const dot = base.lastIndexOf(".");
	return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

/**
 * Checks one import of `importer` against `files`: only relative specifiers
 * that name an existing `.astro` / `.css` file are accepted. Returns the
 * resolved path or an error message.
 */
export function resolveProjectImport(
	files: PreviewFiles,
	importer: string,
	specifier: string,
): { path: string } | { error: string } {
	if (!isRelativeSpecifier(specifier)) {
		return {
			error: `Only relative imports of project files (./, ../) are supported in Preview: ${specifier}`,
		};
	}
	const path = resolveRelativeImport(importer, specifier);
	if (path === null || !(path in files)) {
		return {
			error: `Cannot resolve "${specifier}" from ${importer}: no such file in the project.`,
		};
	}
	if (!IMPORTABLE_EXTENSIONS.includes(extensionOf(path))) {
		return {
			error: `Cannot import "${specifier}" from ${importer}: only .astro and .css files can be imported in Preview.`,
		};
	}
	if (typeof files[path] !== "string") {
		return {
			error: `Cannot import "${specifier}" from ${importer}: it is a binary file.`,
		};
	}
	return { path };
}

/** `checkImport` for `validatePreview`, bound to one importer. */
export function importChecker(
	files: PreviewFiles,
	importer: string,
): ImportCheck {
	return (specifier) => {
		const resolved = resolveProjectImport(files, importer, specifier);
		return "error" in resolved ? resolved.error : null;
	};
}

export interface BuildPreviewGraphOptions {
	/** Path of the entry `.astro` file (must be a key of `files`). */
	entry: string;
	files: PreviewFiles;
	compile: PreviewCompiler;
	validate: PreviewValidator;
	/**
	 * False (Component mode): the entry must be self-contained, exactly as
	 * before Phase 5. True: relative `.astro` / `.css` imports are followed.
	 */
	allowImports: boolean;
}

interface Visit {
	id: string;
	path: string;
}

/**
 * Compile the entry and everything it imports. Throws
 * `PreviewUnsupportedError` for imports the preview cannot follow (including
 * cycles) and whatever `compile` throws otherwise.
 */
export async function buildPreviewGraph(
	options: BuildPreviewGraphOptions,
): Promise<PreviewGraph> {
	const { entry, files, compile, validate, allowImports } = options;
	const source = files[entry];
	if (typeof source !== "string") {
		throw new PreviewUnsupportedError(
			`The entry file ${entry} does not exist in the project.`,
		);
	}

	const modules: PreviewModule[] = [];
	const css: string[] = [];
	const cssSeen = new Set<string>();
	const done = new Map<string, Visit>();
	const stack: string[] = [];
	let counter = 0;

	async function visit(path: string, text: string): Promise<Visit> {
		const cached = done.get(path);
		if (cached) return cached;
		const cycleStart = stack.indexOf(path);
		if (cycleStart !== -1) {
			const chain = [...stack.slice(cycleStart), path].join(" → ");
			throw new PreviewUnsupportedError(
				`Circular imports are not supported in Preview: ${chain}`,
			);
		}
		stack.push(path);

		const isEntry = path === entry;
		const id = isEntry ? ENTRY_MODULE_ID : `module-${++counter}.js`;
		const { result, ast } = await compile(path, text);
		const unsupported = validate(
			result,
			ast,
			allowImports ? importChecker(files, path) : undefined,
		);
		if (unsupported) {
			throw new PreviewUnsupportedError(
				isEntry ? unsupported : `${path}: ${unsupported}`,
			);
		}

		// Dependencies first so their module ids exist when this code is rewritten.
		const replacements = new Map<string, string | null>();
		for (const site of findImportSpecifiers(result.code)) {
			if (site === RUNTIME_SPECIFIER) continue;
			if (STYLE_IMPORT.test(site)) {
				replacements.set(site, null);
				continue;
			}
			const resolved = resolveProjectImport(files, path, site);
			if ("error" in resolved) {
				// validate() already checked the AST; this guards the compiled output.
				throw new PreviewUnsupportedError(
					isEntry ? resolved.error : `${path}: ${resolved.error}`,
				);
			}
			const target = files[resolved.path] as string;
			if (extensionOf(resolved.path) === ".css") {
				if (!cssSeen.has(resolved.path)) {
					cssSeen.add(resolved.path);
					css.push(target);
				}
				replacements.set(site, null);
				continue;
			}
			const dependency = await visit(resolved.path, target);
			replacements.set(site, `./${dependency.id}`);
		}

		css.push(...result.css);
		modules.push({
			id,
			moduleId: path,
			code: rewriteImports(result.code, (specifier) =>
				replacements.has(specifier)
					? (replacements.get(specifier) as string | null)
					: undefined,
			),
			scripts: result.scripts.map((script) =>
				script.type === "inline"
					? { type: "inline", code: script.code }
					: { type: "external", src: script.src },
			),
			containsHead: result.containsHead,
			propagation: result.propagation,
		});
		stack.pop();
		const visited = { id, path };
		done.set(path, visited);
		return visited;
	}

	await visit(entry, source);
	return { modules, css };
}

function findImportSpecifiers(code: string): string[] {
	const specifiers: string[] = [];
	rewriteImports(code, (specifier) => {
		specifiers.push(specifier);
		return undefined;
	});
	return specifiers;
}

/**
 * Memoises `compile` per (path, source) so editing one file only recompiles
 * that file and the graph is rebuilt from cached results otherwise. Call
 * `prune(paths)` after a build to forget files that no longer exist; changing
 * the compile options needs a new cache (`key` them in).
 */
export function createCachedCompiler(compile: PreviewCompiler): {
	compile: PreviewCompiler;
	prune(paths: Iterable<string>): void;
	clear(): void;
} {
	const cache = new Map<string, { source: string; result: CompiledFile }>();
	return {
		compile: async (path, source) => {
			const hit = cache.get(path);
			if (hit && hit.source === source) return hit.result;
			const result = await compile(path, source);
			cache.set(path, { source, result });
			return result;
		},
		prune(paths) {
			const keep = new Set(paths);
			for (const path of cache.keys()) if (!keep.has(path)) cache.delete(path);
		},
		clear() {
			cache.clear();
		},
	};
}
