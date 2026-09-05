// Validate a proposed component with the real compiler before it touches the
// editor. Mirrors what the Preview would reject, so the user never applies
// something that cannot render.
import { compiler } from "../compiler";
import type { CompileOptions } from "../compiler-protocol";
import { DEFAULT_COMPILE_OPTIONS } from "../options";
import { validatePreview } from "../preview";

export type ProposalValidation =
	| { ok: true; warnings: string[] }
	| { ok: false; error: string };

export async function validateProposal(
	code: string,
	options: CompileOptions = DEFAULT_COMPILE_OPTIONS,
): Promise<ProposalValidation> {
	if (code.trim() === "") return { ok: false, error: "The proposal is empty." };
	try {
		const [result, parsed] = await Promise.all([
			compiler.compile(code, options),
			compiler.parse(code),
		]);
		const errors = result.diagnostics.filter((d) => d.severity === "error");
		if (errors.length > 0) {
			return {
				ok: false,
				error: errors
					.map((d) => {
						const label = d.labels?.[0];
						return label ? `${d.text} (line ${label.line})` : d.text;
					})
					.join("\n"),
			};
		}
		const unsupported = validatePreview(result, parsed);
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
