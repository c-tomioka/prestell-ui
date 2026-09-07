// Machine-readable errors shared by the API routes and the chat panel.
//
// The server sends a code plus its parameters instead of prose; the client
// turns that into text (`messages.ts`). Wording therefore lives in one place
// on the client, which keeps error classification independent of the text
// and lets the UI be translated later without touching the server.

export type LocalProvider = "ollama" | "lmstudio";

export type CodedError =
	/** The local OpenAI-compatible server did not answer. */
	| { code: "local-unreachable"; provider: LocalProvider; base: string }
	/** The model produced no output within the timeout. */
	| { code: "timeout"; detail: string };

export type ErrorCode = CodedError["code"];

const CODES: ReadonlySet<string> = new Set<ErrorCode>([
	"local-unreachable",
	"timeout",
]);

/** Serialize for transports that only carry a string (the AI SDK error part). */
export function encodeCodedError(error: CodedError): string {
	return JSON.stringify(error);
}

/**
 * Recover a coded error from a string. Accepts the bare object
 * (`{"code":…}`) and the `errorResponse` envelope (`{"ok":false,"coded":{…}}`).
 */
export function decodeCodedError(text: string): CodedError | null {
	if (!text.startsWith("{")) return null;
	try {
		const parsed = JSON.parse(text) as {
			code?: unknown;
			coded?: unknown;
		};
		const candidate =
			parsed.coded && typeof parsed.coded === "object" ? parsed.coded : parsed;
		const code = (candidate as { code?: unknown }).code;
		return typeof code === "string" && CODES.has(code)
			? (candidate as CodedError)
			: null;
	} catch {
		return null;
	}
}
