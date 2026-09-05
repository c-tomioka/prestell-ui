// Pull the proposed component out of an assistant reply.
//
// The system prompt asks for exactly one ```astro fence, but small models like
// to append a second "usage example" fence. We therefore pick the LONGEST
// complete fence (the component) rather than the last one. While a reply is
// still streaming the closing fence may be missing, which `complete: false`
// signals; in that case the trailing open fence is returned.

export interface ExtractedCode {
	code: string;
	/** False while the fence has not been closed yet (streaming). */
	complete: boolean;
}

const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})[ \t]*astro\b[^\n]*\n/gim;

interface Fence {
	code: string;
	complete: boolean;
}

function findFences(markdown: string): Fence[] {
	const fences: Fence[] = [];
	const open = new RegExp(FENCE_OPEN.source, FENCE_OPEN.flags);
	let match: RegExpExecArray | null = open.exec(markdown);
	while (match !== null) {
		const start = match.index + match[0].length;
		const fence = match[1];
		const rest = markdown.slice(start);
		const close = new RegExp(
			`^[ \\t]*${fence[0]}{${fence.length},}[ \\t]*$`,
			"m",
		).exec(rest);
		if (!close) {
			fences.push({ code: rest.replace(/\s+$/, ""), complete: false });
			break;
		}
		fences.push({
			code: rest.slice(0, close.index).replace(/\n$/, ""),
			complete: true,
		});
		open.lastIndex = start + close.index + close[0].length;
		match = open.exec(markdown);
	}
	return fences;
}

export function extractAstroCode(markdown: string): ExtractedCode | null {
	const fences = findFences(markdown);
	if (fences.length === 0) return null;
	const complete = fences.filter((fence) => fence.complete);
	if (complete.length === 0) return fences[fences.length - 1];
	return complete.reduce((best, fence) =>
		fence.code.length > best.code.length ? fence : best,
	);
}

/** Message text with the extracted fence removed (used for the prose part of a reply). */
export function stripAstroFences(markdown: string): string {
	return markdown
		.replace(
			/^[ \t]*(`{3,}|~{3,})[ \t]*astro\b[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gim,
			"",
		)
		.replace(/^[ \t]*(`{3,}|~{3,})[ \t]*astro\b[^\n]*\n[\s\S]*$/im, "")
		.trim();
}
