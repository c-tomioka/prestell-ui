// Automatic "fix loop": when a proposal fails `validateProposal`, the error is
// sent back to the model as a follow-up user message so it can regenerate the
// component. Pure helpers only; the chat panel drives the loop.
import type { UIMessage } from "ai";

export interface FixMetadata {
	kind: "fix";
	/** 1-based attempt number within the current chain. */
	attempt: number;
	max: number;
}

export const DEFAULT_MAX_FIX_ATTEMPTS = 2;
export const MAX_FIX_ATTEMPTS_LIMIT = 5;

export function clampFixAttempts(value: unknown): number {
	const n =
		typeof value === "number" && Number.isFinite(value)
			? Math.round(value)
			: DEFAULT_MAX_FIX_ATTEMPTS;
	return Math.min(MAX_FIX_ATTEMPTS_LIMIT, Math.max(1, n));
}

export function fixMetadataOf(message: UIMessage): FixMetadata | null {
	const meta = message.metadata as Partial<FixMetadata> | undefined;
	if (meta?.kind !== "fix" || typeof meta.attempt !== "number") return null;
	return {
		kind: "fix",
		attempt: meta.attempt,
		max: typeof meta.max === "number" ? meta.max : meta.attempt,
	};
}

export function isFixMessage(message: UIMessage): boolean {
	return message.role === "user" && fixMetadataOf(message) !== null;
}

/**
 * Number of fix requests already sent since the last message the user typed
 * themselves. A manual message resets the chain to 0.
 */
export function pendingFixAttempts(messages: UIMessage[]): number {
	let count = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role !== "user") continue;
		if (fixMetadataOf(message)) count++;
		else break;
	}
	return count;
}

/** Follow-up sent to the model. Kept consistent with the system prompt's output contract. */
export function buildFixPrompt(
	error: string,
	attempt: number,
	max: number,
): string {
	return [
		`The component in your previous reply failed validation (auto-fix attempt ${attempt}/${max}). The editor still holds the older component; fix the code from your previous reply, not the editor contents.`,
		"",
		"Errors:",
		"```",
		error.trim(),
		"```",
		"",
		"Return the COMPLETE corrected component in exactly ONE fenced code block tagged `astro`. Keep it self-contained (no imports, no framework components, no `client:*` directives, no external scripts) and keep everything that already worked.",
	].join("\n");
}
