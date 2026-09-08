// Pull the proposed code out of an assistant reply.
//
// Component mode: the system prompt asks for exactly one ```astro fence, but
// small models like to append a second "usage example" fence, so the LONGEST
// complete fence wins. Page / Site mode: one fence per file, tagged with its
// path (```astro path=src/pages/index.astro); a lone untagged ```astro fence
// is taken as the file open in the editor. While a reply is still streaming
// the closing fence may be missing, which `complete: false` signals.

export interface ExtractedCode {
	code: string;
	/** False while the fence has not been closed yet (streaming). */
	complete: boolean;
}

export interface ExtractedFile extends ExtractedCode {
	path: string;
}

/** Fence languages that may carry a project file. */
const FILE_LANGUAGES = new Set([
	"astro",
	"css",
	"svg",
	"html",
	"xml",
	"json",
	"js",
	"javascript",
	"txt",
	"text",
	"plain",
	"webmanifest",
]);

const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})[ \t]*([\w-]*)([^\n]*)\n/gm;
const PATH_ATTRIBUTE =
	/(?:^|\s)(?:path|file|filename|title)=["'`]?([^\s"'`]+)/i;

interface Fence {
	language: string;
	path: string | null;
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
		const language = match[2].toLowerCase();
		const path = PATH_ATTRIBUTE.exec(match[3])?.[1] ?? null;
		const rest = markdown.slice(start);
		const close = new RegExp(
			`^[ \\t]*${fence[0]}{${fence.length},}[ \\t]*$`,
			"m",
		).exec(rest);
		if (!close) {
			fences.push({
				language,
				path,
				code: rest.replace(/\s+$/, ""),
				complete: false,
			});
			break;
		}
		fences.push({
			language,
			path,
			code: rest.slice(0, close.index).replace(/\n$/, ""),
			complete: true,
		});
		open.lastIndex = start + close.index + close[0].length;
		match = open.exec(markdown);
	}
	return fences;
}

function longest(fences: Fence[]): ExtractedCode | null {
	if (fences.length === 0) return null;
	const complete = fences.filter((fence) => fence.complete);
	if (complete.length === 0) {
		const last = fences[fences.length - 1];
		return { code: last.code, complete: false };
	}
	const best = complete.reduce((a, b) =>
		b.code.length > a.code.length ? b : a,
	);
	return { code: best.code, complete: true };
}

/** Component mode: the one ```astro block (longest complete fence). */
export function extractAstroCode(markdown: string): ExtractedCode | null {
	return longest(findFences(markdown).filter((f) => f.language === "astro"));
}

/**
 * Page / Site mode: every path-tagged fence, last occurrence of a path wins.
 * Without any tagged fence, a plain ```astro block is taken as `activePath`.
 * `complete` is false when the last fence is still open (streaming).
 */
export function extractProposalFiles(
	markdown: string,
	activePath: string,
): { files: ExtractedFile[]; complete: boolean } | null {
	const fences = findFences(markdown).filter(
		(f) => FILE_LANGUAGES.has(f.language) || f.path !== null,
	);
	const tagged = fences.filter((f) => f.path !== null);
	if (tagged.length === 0) {
		const single = longest(fences.filter((f) => f.language === "astro"));
		return single
			? { files: [{ path: activePath, ...single }], complete: single.complete }
			: null;
	}
	const byPath = new Map<string, ExtractedFile>();
	for (const fence of tagged) {
		const path = normalizeProposalPath(fence.path as string);
		byPath.set(path, { path, code: fence.code, complete: fence.complete });
	}
	const files = [...byPath.values()];
	return { files, complete: files.every((file) => file.complete) };
}

/** `./src/x.astro`, `/src/x.astro`, backticks → `src/x.astro`. */
export function normalizeProposalPath(path: string): string {
	return path
		.trim()
		.replace(/^[`'"]+|[`'"]+$/g, "")
		.replace(/\\/g, "/")
		.replace(/^\.?\//, "");
}

const ANY_FENCE =
	/^[ \t]*(`{3,}|~{3,})[ \t]*([\w-]*)([^\n]*)\n[\s\S]*?^[ \t]*\1[ \t]*$/gim;
const OPEN_FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*([\w-]*)([^\n]*)\n[\s\S]*$/im;

function isFileFence(language: string, info: string): boolean {
	return (
		FILE_LANGUAGES.has(language.toLowerCase()) || PATH_ATTRIBUTE.test(info)
	);
}

/** Message text with the code fences removed (used for the prose part of a reply). */
export function stripCodeFences(markdown: string): string {
	return markdown
		.replace(
			ANY_FENCE,
			(match, _fence: string, language: string, info: string) =>
				isFileFence(language, info) ? "" : match,
		)
		.replace(
			OPEN_FENCE,
			(match, _fence: string, language: string, info: string) =>
				isFileFence(language, info) ? "" : match,
		)
		.trim();
}

/** @deprecated Kept for callers of the Component-mode name; same as `stripCodeFences`. */
export const stripAstroFences = stripCodeFences;
