// Turns compiler diagnostics into the error text shown on the proposal card
// and sent back to the model by the fix loop. Adds the source line under each
// `(line N)` so the model sees what it has to fix, not just where.
// No runtime imports: the eval harness shares this with the native compiler.
import type { DiagnosticMessage } from "@astrojs/compiler-binding";

export function formatCompilerErrors(
	code: string,
	diagnostics: DiagnosticMessage[],
): string {
	const lines = code.split(/\r?\n/);
	return diagnostics
		.map((d) => {
			const label = d.labels?.[0];
			if (!label) return d.text;
			const head = `${d.text} (line ${label.line})`;
			const body = lines[label.line - 1];
			if (body === undefined || body.trim() === "") return head;
			return `${head}\n  ${label.line} | ${body.trimEnd()}`;
		})
		.join("\n");
}
