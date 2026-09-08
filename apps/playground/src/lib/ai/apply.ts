// Validate a proposed component with the real compiler before it touches the
// editor. Mirrors what the Preview would reject, so the user never applies
// something that cannot render.
import { compiler } from "../compiler";
import type { CompileOptions } from "../compiler-protocol";
import { DEFAULT_COMPILE_OPTIONS } from "../options";
import { validatePreview } from "../preview";
import {
	buildPreviewGraph,
	type CompiledFile,
	extensionOf,
	type ImportCheck,
	importChecker,
	type PreviewCompiler,
	PreviewUnsupportedError,
} from "../preview-graph";
import { validateFilePath } from "../projects/files";
import type { ProjectFile, ProjectMode } from "../projects/types";
import { formatCompilerErrors } from "./format-diagnostics";
import type { ProposalFile } from "./types";

export type ProposalValidation =
	| { ok: true; warnings: string[] }
	| { ok: false; error: string };

/**
 * `checkImport` (Page / Site projects) allows the relative imports the
 * preview can follow; without it the proposal must be self-contained.
 */
export async function validateProposal(
	code: string,
	options: CompileOptions = DEFAULT_COMPILE_OPTIONS,
	checkImport?: ImportCheck,
): Promise<ProposalValidation> {
	if (code.trim() === "") return { ok: false, error: "The proposal is empty." };
	try {
		const [result, parsed] = await Promise.all([
			compiler.compile(code, options),
			compiler.parse(code),
		]);
		const errors = result.diagnostics.filter((d) => d.severity === "error");
		if (errors.length > 0) {
			return { ok: false, error: formatCompilerErrors(code, errors) };
		}
		const unsupported = validatePreview(result, parsed, checkImport);
		if (unsupported) return { ok: false, error: unsupported };
		return {
			ok: true,
			warnings: result.diagnostics
				.filter((d) => d.severity === "warning")
				.map((d) => d.text),
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/** Compiles with the app's compiler Worker (the eval harness passes the native compiler). */
export const workerCompiler: PreviewCompiler = async (path, text) => {
	const [result, ast] = await Promise.all([
		compiler.compile(text, {
			filename: path,
			internalURL: "./runtime.js",
			resolvePathProvided: true,
		}),
		compiler.parse(text),
	]);
	return { result, ast };
};

export interface ProjectProposalInput {
	files: ProposalFile[];
	/** Current project files; the proposal is validated on top of them. */
	project: Readonly<Record<string, ProjectFile>>;
	entry: string;
	mode: ProjectMode;
}

const PATH_PROBLEMS: Record<string, string> = {
	"files.invalidPath":
		"invalid path (use letters, digits, dots, dashes and underscores; relative to the project root)",
	"files.componentPath": "a Component project holds one top-level .astro file",
	"files.unsupportedType":
		"unsupported file type (allowed: .astro, .css, .svg, .txt, .json, .xml, .html, .js, .webmanifest)",
	"files.outsideRoots": "files must live under src/ or public/",
	"files.astroOutsideSrc": ".astro files must live under src/",
};

/**
 * Validate a Page / Site proposal: every path must be allowed, every `.astro`
 * file must compile and pass the preview rules against the merged project,
 * and the entry page must still build a preview graph. Errors name the file.
 */
export async function validateProjectProposal(
	input: ProjectProposalInput,
	compile: PreviewCompiler = workerCompiler,
): Promise<ProposalValidation> {
	if (input.files.length === 0)
		return { ok: false, error: "The proposal is empty." };
	const errors: string[] = [];
	const warnings: string[] = [];
	const merged: Record<string, ProjectFile> = { ...input.project };
	for (const file of input.files) {
		const checked = validateFilePath(file.path, input.mode);
		if ("error" in checked) {
			errors.push(
				`${file.path}: ${PATH_PROBLEMS[checked.error] ?? checked.error}`,
			);
			continue;
		}
		if (file.code.trim() === "") {
			errors.push(`${file.path}: the file is empty.`);
			continue;
		}
		merged[checked.path] = file.code;
	}
	if (errors.length > 0) return { ok: false, error: errors.join("\n") };

	const compiled = new Map<string, CompiledFile>();
	const cachedCompile: PreviewCompiler = async (path, text) => {
		const hit = compiled.get(path);
		if (hit) return hit;
		const out = await compile(path, text);
		compiled.set(path, out);
		return out;
	};

	try {
		for (const file of input.files) {
			if (extensionOf(file.path) !== ".astro") continue;
			const { result, ast } = await cachedCompile(file.path, file.code);
			const compileErrors = result.diagnostics.filter(
				(d) => d.severity === "error",
			);
			if (compileErrors.length > 0) {
				errors.push(
					`${file.path}:\n${formatCompilerErrors(file.code, compileErrors)}`,
				);
				continue;
			}
			const unsupported = validatePreview(
				result,
				ast,
				input.mode === "component"
					? undefined
					: importChecker(merged, file.path),
			);
			if (unsupported) errors.push(`${file.path}: ${unsupported}`);
			warnings.push(
				...result.diagnostics
					.filter((d) => d.severity === "warning")
					.map((d) => `${file.path}: ${d.text}`),
			);
		}
		if (errors.length > 0) return { ok: false, error: errors.join("\n") };

		if (input.entry in merged) {
			await buildPreviewGraph({
				entry: input.entry,
				files: merged,
				compile: cachedCompile,
				validate: validatePreview,
				allowImports: input.mode !== "component",
			});
		}
		return { ok: true, warnings };
	} catch (error) {
		if (error instanceof PreviewUnsupportedError)
			return { ok: false, error: error.message };
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
