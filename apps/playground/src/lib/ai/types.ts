// Shared client-side types for the chat panel.
import type { ProviderInfo } from "../../server/ai/providers";

export type { ProviderInfo };

export type ProposalStatus =
	| "streaming"
	| "validating"
	| "valid"
	| "invalid"
	| "applied";

export interface Proposal {
	code: string;
	status: ProposalStatus;
	error?: string;
	warnings?: string[];
}
