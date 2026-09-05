// Small pure helpers shared by the stores and the UI.
import type { Proposal } from "../ai/types";
import type { ShareableOptions } from "../share";
import type { ProjectRecord, ProjectSummary } from "./types";

export function toSummary(record: ProjectRecord): ProjectSummary {
	return {
		id: record.id,
		name: record.name,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

export function sortByUpdated<T extends { updatedAt: number }>(
	items: T[],
): T[] {
	return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createProjectRecord(input: {
	name: string;
	source: string;
	options?: Partial<ShareableOptions>;
	now?: number;
	id?: string;
}): ProjectRecord {
	const now = input.now ?? Date.now();
	return {
		id: input.id ?? crypto.randomUUID(),
		name: input.name,
		createdAt: now,
		updatedAt: now,
		source: input.source,
		options: { ...(input.options ?? {}) },
		schemaVersion: 1,
	};
}

/** Drop proposals that were still in flight; they cannot resume after a reload. */
export function persistableProposals(
	proposals: Record<string, Proposal>,
): Record<string, Proposal> {
	const kept: Record<string, Proposal> = {};
	for (const [id, proposal] of Object.entries(proposals)) {
		if (proposal.status === "streaming" || proposal.status === "validating")
			continue;
		if (proposal.fix?.state === "retrying") {
			// A retry that never completed reads as "gave up" once restored.
			kept[id] = { ...proposal, fix: { ...proposal.fix, state: "gave-up" } };
			continue;
		}
		kept[id] = proposal;
	}
	return kept;
}
