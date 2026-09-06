// Shared client-side types for the chat panel.
import type { ProviderInfo } from "../../server/ai/providers";

export type { ProviderInfo };

export type ProposalStatus =
	| "streaming"
	| "validating"
	| "valid"
	| "invalid"
	| "applied";

export interface ProposalFix {
	/** 1-based number of the fix request this proposal triggered (or ended on). */
	attempt: number;
	max: number;
	/**
	 * `retrying`: a fix request is in flight; `resolved`: the model replied to
	 * it (see the next card); `gave-up`: the limit was reached or the retry
	 * never completed.
	 */
	state: "retrying" | "resolved" | "gave-up";
}

/** Server-side notice streamed as a `data-notice` part (kept in the history). */
export interface ChatNotice {
	kind: "docs-unavailable";
	message: string;
}

export interface Proposal {
	code: string;
	status: ProposalStatus;
	error?: string;
	warnings?: string[];
	/** Present when the automatic fix loop acted on this proposal. */
	fix?: ProposalFix;
}
