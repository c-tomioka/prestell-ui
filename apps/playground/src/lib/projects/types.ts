// Browser-side persistence model for projects and their chat threads.
//
// One project = one `.astro` component + compile options + one chat thread.
// Projects and chats live in separate stores so the editor (Playground) and the
// chat panel can each write their own record without clobbering the other.
// `ProjectStore` is the seam that a server-backed implementation (Durable
// Objects, Phase 5) can satisfy later without touching the UI.
import type { UIMessage } from "ai";
import type { Proposal } from "../ai/types";
import type { ShareableOptions } from "../share";

export interface ProjectRecord {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	source: string;
	options: Partial<ShareableOptions>;
	schemaVersion: 1;
}

export type ProjectSummary = Pick<
	ProjectRecord,
	"id" | "name" | "createdAt" | "updatedAt"
>;

export interface ChatRecord {
	projectId: string;
	messages: UIMessage[];
	/** Finalized proposals only (transient `streaming` / `validating` are dropped). */
	proposals: Record<string, Proposal>;
	updatedAt: number;
}

export interface ProjectStore {
	/** All projects, most recently updated first. */
	list(): Promise<ProjectSummary[]>;
	get(id: string): Promise<ProjectRecord | undefined>;
	put(record: ProjectRecord): Promise<void>;
	/** Removes the project and its chat thread. */
	delete(id: string): Promise<void>;
	getChat(projectId: string): Promise<ChatRecord | undefined>;
	putChat(record: ChatRecord): Promise<void>;
}
