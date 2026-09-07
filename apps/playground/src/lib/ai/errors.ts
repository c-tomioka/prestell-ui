// Classify chat transport errors for the panel: strip the raw JSON body the AI
// SDK hands us for non-2xx responses, and decide whether an automatic retry is
// worth it. Pure so it can be unit-tested.
import { type CodedError, decodeCodedError } from "./error-codes";
import { describeCodedError } from "./messages";

export type ChatErrorKind =
	| "local-down"
	| "network"
	| "timeout"
	| "rate-limit"
	| "server"
	| "request"
	| "unknown";

export interface ChatErrorInfo {
	kind: ChatErrorKind;
	message: string;
	/** True when the same request may succeed if simply sent again. */
	transient: boolean;
}

/** Delay before the single automatic retry. */
export const AUTO_RETRY_DELAY_MS = 1500;
/** Automatic retries per request (manual Retry is always available). */
export const MAX_AUTO_RETRIES = 1;

const TRANSIENT: ReadonlySet<ChatErrorKind> = new Set([
	"network",
	"timeout",
	"rate-limit",
	"server",
]);

const KIND_BY_CODE: Record<CodedError["code"], ChatErrorKind> = {
	"local-unreachable": "local-down",
	timeout: "timeout",
};

function unwrapJsonBody(message: string): string {
	// `DefaultChatTransport` throws `new Error(await response.text())`, so an
	// `errorResponse()` from /api/* arrives as `{"ok":false,"error":"…"}`.
	if (!message.startsWith("{")) return message;
	try {
		const parsed = JSON.parse(message) as { error?: unknown };
		if (typeof parsed.error === "string" && parsed.error.trim())
			return parsed.error.trim();
	} catch {
		// not JSON after all
	}
	return message;
}

export function classifyChatError(message: string): ChatErrorKind {
	if (
		/cannot reach (ollama|lm studio)|ollama serve|start server/i.test(message)
	)
		return "local-down";
	if (/timed out|timeout|did not respond in time/i.test(message))
		return "timeout";
	if (/rate limit|too many requests|\b429\b/i.test(message))
		return "rate-limit";
	if (
		/failed to fetch|fetch failed|load failed|network|connection (lost|reset|refused)|ECONNRESET|ECONNREFUSED/i.test(
			message,
		)
	)
		return "network";
	if (
		/\b5\d\d\b|internal server error|bad gateway|service unavailable|gateway timeout|overloaded/i.test(
			message,
		)
	)
		return "server";
	if (/invalid chat request|not configured|\b4\d\d\b/i.test(message))
		return "request";
	return "unknown";
}

export function describeChatError(error: Error | string): ChatErrorInfo {
	const raw = (typeof error === "string" ? error : error.message)?.trim();
	// Coded errors carry their kind; the text is composed on the client.
	const coded = raw ? decodeCodedError(raw) : null;
	if (coded) {
		const kind = KIND_BY_CODE[coded.code];
		return {
			kind,
			message: describeCodedError(coded),
			transient: TRANSIENT.has(kind),
		};
	}
	const message = unwrapJsonBody(raw || "The request failed.");
	const kind = classifyChatError(message);
	return { kind, message, transient: TRANSIENT.has(kind) };
}
