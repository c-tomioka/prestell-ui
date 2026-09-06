import type { DiagnosticMessage } from "@astrojs/compiler-binding";
import { describe, expect, it } from "vitest";
import { formatCompilerErrors } from "./format-diagnostics";

function diagnostic(text: string, line?: number): DiagnosticMessage {
	return {
		severity: "error",
		text,
		hint: "",
		labels:
			line === undefined
				? []
				: [{ text: null, start: 0, end: 0, line, column: 0 }],
	};
}

const code = ["---", "const x = 1;", "---", "<div class={x}", "</div>"].join(
	"\n",
);

describe("formatCompilerErrors", () => {
	it("appends the source line under the (line N) marker", () => {
		expect(
			formatCompilerErrors(code, [diagnostic("Unexpected token", 4)]),
		).toBe("Unexpected token (line 4)\n  4 | <div class={x}");
	});

	it("keeps the plain text when there is no label", () => {
		expect(
			formatCompilerErrors(code, [diagnostic("Unterminated frontmatter")]),
		).toBe("Unterminated frontmatter");
	});

	it("omits the body when the line is out of range or blank", () => {
		expect(formatCompilerErrors(code, [diagnostic("EOF", 99)])).toBe(
			"EOF (line 99)",
		);
		expect(formatCompilerErrors("a\n\nb", [diagnostic("Blank", 2)])).toBe(
			"Blank (line 2)",
		);
	});

	it("handles CRLF sources and joins multiple errors with newlines", () => {
		const crlf = "---\r\nconst y = 2;\r\n---\r\n<p>{y}\r\n";
		expect(
			formatCompilerErrors(crlf, [diagnostic("A", 2), diagnostic("B", 4)]),
		).toBe("A (line 2)\n  2 | const y = 2;\nB (line 4)\n  4 | <p>{y}");
	});
});
