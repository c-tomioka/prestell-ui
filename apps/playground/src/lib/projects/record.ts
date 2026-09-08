// Small pure helpers shared by the stores and the UI.
import type { Proposal } from "../ai/types";
import { normalizeFilename } from "../export";
import type {
	ProjectFile,
	ProjectMode,
	ProjectOptions,
	ProjectRecord,
	ProjectSummary,
	StoredProjectRecord,
} from "./types";

export function toSummary(record: StoredProjectRecord): ProjectSummary {
	return {
		id: record.id,
		name: record.name,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		mode: record.schemaVersion === 2 ? record.mode : "component",
	};
}

export function sortByUpdated<T extends { updatedAt: number }>(
	items: T[],
): T[] {
	return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createProjectRecord(input: {
	name: string;
	mode: ProjectMode;
	entry: string;
	files: Record<string, ProjectFile>;
	options?: Partial<ProjectOptions>;
	now?: number;
	id?: string;
}): ProjectRecord {
	const now = input.now ?? Date.now();
	return {
		id: input.id ?? crypto.randomUUID(),
		name: input.name,
		createdAt: now,
		updatedAt: now,
		schemaVersion: 2,
		mode: input.mode,
		entry: input.entry,
		files: { ...input.files },
		options: pickProjectOptions(input.options ?? {}),
	};
}

/** Drop everything but the persisted compile options (e.g. a v1 `filename`). */
export function pickProjectOptions(
	options: Partial<ProjectOptions> & Record<string, unknown>,
): Partial<ProjectOptions> {
	const picked: Partial<ProjectOptions> = {};
	if (options.sourcemap !== undefined) picked.sourcemap = options.sourcemap;
	if (options.compact !== undefined) picked.compact = options.compact;
	if (options.scopedStyleStrategy !== undefined)
		picked.scopedStyleStrategy = options.scopedStyleStrategy;
	return picked;
}

/**
 * Bring a stored record up to the current schema. A Phase 2 record (one
 * `source` + `options.filename`) becomes a Component-mode project whose only
 * file is that component; nothing is written back until the next save.
 */
export function upgradeProjectRecord(
	stored: StoredProjectRecord,
): ProjectRecord {
	if (stored.schemaVersion === 2) return stored;
	const entry = normalizeFilename(stored.options.filename ?? "");
	return {
		id: stored.id,
		name: stored.name,
		createdAt: stored.createdAt,
		updatedAt: stored.updatedAt,
		schemaVersion: 2,
		mode: "component",
		entry,
		files: { [entry]: stored.source },
		options: pickProjectOptions(stored.options),
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
