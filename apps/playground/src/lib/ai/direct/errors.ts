// Turn AI SDK / fetch failures of the direct mode into coded errors so the
// chat panel composes the text (`messages.ts`) and picks the retry behaviour
// (`errors.ts`) exactly as it does for `/api/chat`.
import {
	type CodedError,
	codedError,
	decodeCodedError,
	encodeCodedError,
} from "../error-codes";
import {
	isDirectCloudProvider,
	isLocalProvider,
	type ProviderId,
} from "../providers-catalog";

export interface DirectErrorContext {
	provider: ProviderId;
	/** Local server base URL (local providers only). */
	base?: string;
	/** Page origin, for the CORS instruction. */
	origin: string;
}

interface ApiCallErrorLike {
	name?: unknown;
	message?: unknown;
	statusCode?: unknown;
	responseBody?: unknown;
}

function asObject(error: unknown): Record<string, unknown> | null {
	return error && typeof error === "object"
		? (error as Record<string, unknown>)
		: null;
}

/** The AI SDK wraps retried failures; the last attempt carries the real cause. */
function unwrap(error: unknown): unknown {
	const obj = asObject(error);
	if (!obj) return error;
	if (obj.name === "AI_RetryError") {
		return unwrap(obj.lastError ?? obj.cause ?? error);
	}
	return error;
}

function isApiCallError(error: unknown): error is ApiCallErrorLike {
	const obj = asObject(error);
	return (
		obj !== null &&
		(obj.name === "AI_APICallError" || typeof obj.statusCode === "number")
	);
}

/** Pull a short human-readable detail out of a provider error body. */
export function providerErrorDetail(body: unknown, fallback = ""): string {
	let text = typeof body === "string" ? body.trim() : "";
	if (text.startsWith("{")) {
		try {
			const parsed = JSON.parse(text) as {
				error?: { message?: unknown } | string;
				message?: unknown;
			};
			const message =
				typeof parsed.error === "string"
					? parsed.error
					: typeof parsed.error?.message === "string"
						? parsed.error.message
						: typeof parsed.message === "string"
							? parsed.message
							: "";
			if (message) text = message;
		} catch {
			// keep the raw body
		}
	}
	if (!text) text = fallback.trim();
	return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function messageOf(error: unknown): string {
	const obj = asObject(error);
	if (obj && typeof obj.message === "string") return obj.message;
	return String(error);
}

/**
 * Classify a direct-mode failure. Returns a `CodedError` for the situations
 * the panel has wording for, or the raw message otherwise (the panel's text
 * heuristics still apply to it).
 */
export function describeDirectError(
	error: unknown,
	context: DirectErrorContext,
): CodedError | string {
	const cause = unwrap(error);
	const message = messageOf(cause);
	const { provider } = context;

	// Already coded (thrown by createDirectModel or an earlier pass).
	const coded = decodeCodedError(message);
	if (coded) return coded;

	const obj = asObject(cause);
	if (obj?.name === "AI_LoadAPIKeyError" && isDirectCloudProvider(provider)) {
		return { code: "key-missing", provider };
	}

	if (isApiCallError(cause) && typeof cause.statusCode === "number") {
		const status = cause.statusCode;
		if ((status === 401 || status === 403) && isDirectCloudProvider(provider)) {
			return { code: "key-rejected", provider, status };
		}
		return {
			code: "provider-error",
			provider,
			status,
			detail: providerErrorDetail(cause.responseBody, message),
		};
	}

	if (
		(obj?.name === "TimeoutError" && !/fetch/i.test(message)) ||
		/timed out|timeout/i.test(message)
	) {
		return { code: "timeout", detail: message };
	}

	// `fetch` rejects with a TypeError for network failures and CORS blocks alike.
	if (
		cause instanceof TypeError ||
		/failed to fetch|load failed|networkerror|network request failed|ECONNREFUSED/i.test(
			message,
		)
	) {
		if (isLocalProvider(provider)) {
			return {
				code: "direct-unreachable",
				provider,
				base: context.base ?? "",
				origin: context.origin,
			};
		}
		if (isDirectCloudProvider(provider)) {
			return { code: "direct-network", provider, detail: message };
		}
	}

	return message;
}

/** Error text for the UI message stream (`onError` of the AI SDK). */
export function directErrorText(
	error: unknown,
	context: DirectErrorContext,
): string {
	const described = describeDirectError(error, context);
	return typeof described === "string"
		? described
		: encodeCodedError(described);
}

/** Rethrow-able `Error` carrying the coded form (or the raw message). */
export function toDirectError(
	error: unknown,
	context: DirectErrorContext,
): Error {
	const described = describeDirectError(error, context);
	return typeof described === "string"
		? error instanceof Error
			? error
			: new Error(described)
		: codedError(described);
}
