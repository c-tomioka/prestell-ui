// Pure helpers for rewriting the import specifiers of compiled Astro code.
// Dependency-free so they are trivially unit-testable and safe to import inside
// the render Workers.

/** Specifier the compiler is asked to use for the runtime (`internalURL`). */
export const RUNTIME_SPECIFIER = "./runtime.js";

/**
 * A top-level static import as the compiler emits it (one per statement, at
 * the top of the module): `import X from "s"`, `import { a } from 's'`,
 * `import * as X from "s"` or a bare `import "s"`. The clause may span lines.
 * Captures: 1 = everything before the specifier, 2 = quote, 3 = specifier.
 */
const IMPORT_STATEMENT =
	/^(import\s+(?:[^'";]*?\sfrom\s+)?)(["'])([^"'\n]+)\2[ \t]*;?[ \t]*$/gm;

export interface ImportSite {
	specifier: string;
	/** Offsets of the whole statement within the code. */
	start: number;
	end: number;
}

/** Every top-level static import of `code`, in source order. */
export function findImports(code: string): ImportSite[] {
	const sites: ImportSite[] = [];
	for (const match of code.matchAll(IMPORT_STATEMENT)) {
		sites.push({
			specifier: match[3],
			start: match.index,
			end: match.index + match[0].length,
		});
	}
	return sites;
}

/**
 * Rewrite import specifiers. `map` returns the replacement specifier, `null`
 * to drop the whole statement (side-effect imports such as CSS), or
 * `undefined` to leave it unchanged.
 */
export function rewriteImports(
	code: string,
	map: (specifier: string) => string | null | undefined,
): string {
	return code.replace(
		IMPORT_STATEMENT,
		(statement, head: string, quote: string, specifier: string) => {
			const next = map(specifier);
			if (next === undefined) return statement;
			if (next === null) return "";
			return `${head}${quote}${next}${quote};`;
		},
	);
}

/**
 * Point the compiled component's runtime import at the given URL. Inside a
 * Blob module the relative specifier cannot resolve, so it is rewritten to
 * the Blob URL of the bundled runtime.
 */
export function rewriteRuntimeImport(code: string, runtimeUrl: string): string {
	return rewriteImports(code, (specifier) =>
		specifier === RUNTIME_SPECIFIER ? runtimeUrl : undefined,
	);
}
