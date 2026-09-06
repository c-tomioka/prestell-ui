// Retry / timeout policy for the AI endpoints. Pure helpers and constants so
// the numbers live in one place and the retry loop is unit-testable.

/** Retries before the LLM stream starts (connection / HTTP failures). Same as the AI SDK default, made explicit. */
export const LLM_MAX_RETRIES = 2;
/** A local model may still be loading; give the first token generous time. */
export const LLM_FIRST_CHUNK_TIMEOUT_MS = 60_000;
/** Abort a stream that goes silent for this long. */
export const LLM_CHUNK_TIMEOUT_MS = 30_000;
/** Astro Docs MCP: transport start + initialize handshake. */
export const MCP_CONNECT_TIMEOUT_MS = 8_000;
/** Astro Docs MCP: one `search_astro_docs` call. */
export const MCP_TOOL_TIMEOUT_MS = 10_000;
/** Extra attempts for MCP connect / search after the first failure. */
export const MCP_RETRIES = 1;
export const MCP_RETRY_DELAY_MS = 300;

export interface RetryOptions {
	/** Total attempts, including the first one (1 = no retry). */
	attempts: number;
	/** Base delay between attempts; multiplied by the attempt number. */
	delayMs?: number;
	/** Return false to stop retrying for this error. Default: always retry. */
	shouldRetry?: (error: unknown) => boolean;
	/** Injectable for tests. */
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
	fn: (attempt: number) => Promise<T>,
	options: RetryOptions,
): Promise<T> {
	const {
		attempts,
		delayMs = 0,
		shouldRetry = () => true,
		sleep = defaultSleep,
	} = options;
	const total = Math.max(1, Math.floor(attempts));
	let lastError: unknown;
	for (let attempt = 1; attempt <= total; attempt++) {
		try {
			return await fn(attempt);
		} catch (error) {
			lastError = error;
			if (attempt >= total || !shouldRetry(error)) throw error;
			if (delayMs > 0) await sleep(delayMs * attempt);
		}
	}
	throw lastError;
}
