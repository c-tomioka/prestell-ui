// Pure helpers for the browser renderer (kept dependency-free so they are
// trivially unit-testable and safe to import inside the Worker).

/** Specifier the compiler is asked to use for the runtime (`internalURL`). */
export const RUNTIME_SPECIFIER = "./runtime.js";

const RUNTIME_IMPORT = /(\bfrom\s*)(["'])\.\/runtime\.js\2/g;

/**
 * Point the compiled component's runtime import at the given URL. The compiler
 * emits a single `import { … } from "./runtime.js"` statement; inside a Blob
 * module that relative specifier cannot resolve, so it is rewritten to the
 * Blob URL of the bundled runtime.
 */
export function rewriteRuntimeImport(code: string, runtimeUrl: string): string {
	return code.replace(RUNTIME_IMPORT, (_match, from: string, quote: string) => {
		return `${from}${quote}${runtimeUrl}${quote}`;
	});
}
