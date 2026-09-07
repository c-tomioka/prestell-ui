// Machine-readable errors shared by the API routes, the browser-side direct
// transport, and the chat panel.
//
// Whoever detects the failure sends a code plus its parameters instead of
// prose; the client turns that into text (`messages.ts`). Wording therefore
// lives in one place, which keeps error classification independent of the
// text and lets the UI be translated later without touching the server.
import type {
	DirectCloudProviderId,
	LocalProviderId,
	ProviderId,
} from "./providers-catalog";

export type LocalProvider = LocalProviderId;

export type CodedError =
	/** Server mode: the local OpenAI-compatible server did not answer the Worker. */
	| { code: "local-unreachable"; provider: LocalProvider; base: string }
	/** The model produced no output within the timeout. */
	| { code: "timeout"; detail: string }
	/** Direct mode: the browser could not reach the local server (down or CORS). */
	| {
			code: "direct-unreachable";
			provider: LocalProvider;
			base: string;
			/** The page origin, for the CORS instruction. */
			origin: string;
	  }
	/** Direct mode: a cloud provider could not be reached from the browser. */
	| { code: "direct-network"; provider: DirectCloudProviderId; detail: string }
	/** Direct mode: this provider cannot be called from the browser (no CORS). */
	| { code: "direct-unsupported"; provider: ProviderId }
	/** Direct mode: no API key entered for this provider. */
	| { code: "key-missing"; provider: DirectCloudProviderId }
	/** Direct mode: the provider rejected the key (401 / 403). */
	| { code: "key-rejected"; provider: DirectCloudProviderId; status: number }
	/** Any other HTTP error from the provider (429, 5xx, 4xx). */
	| {
			code: "provider-error";
			provider: ProviderId;
			status: number;
			detail: string;
	  };

export type ErrorCode = CodedError["code"];

const CODES: ReadonlySet<string> = new Set<ErrorCode>([
	"local-unreachable",
	"timeout",
	"direct-unreachable",
	"direct-network",
	"direct-unsupported",
	"key-missing",
	"key-rejected",
	"provider-error",
]);

/** Serialize for transports that only carry a string (the AI SDK error part). */
export function encodeCodedError(error: CodedError): string {
	return JSON.stringify(error);
}

/** An `Error` whose message the chat panel decodes back into the code. */
export function codedError(error: CodedError): Error {
	return new Error(encodeCodedError(error));
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
