// Browser-side persistence model for projects and their chat threads.
//
// One project = a map of files + the file the preview renders (`entry`) +
// a mode preset + compile options + one chat thread. Projects and chats live
// in separate stores so the editor (Playground) and the chat panel can each
// write their own record without clobbering the other. `ProjectStore` is the
// seam that a server-backed implementation (Durable Objects, Phase 7) can
// satisfy later without touching the UI.
import type { CompileOptions } from "@astrojs/compiler-binding";
import type { UIMessage } from "ai";
import type { Proposal } from "../ai/types";

/**
 * Preset the project was created with. All three share the same file model;
 * the mode only changes the initial files, what the UI shows (no file tree in
 * Component mode) and whether imports are allowed in the preview.
 */
export type ProjectMode = "component" | "page" | "site";

/** Text files are strings; uploaded binaries (`public/…`, Phase 5) are Blobs. */
export type ProjectFile = string | Blob;

/** Compile options that are saved with the project (the filename is `entry`). */
export type ProjectOptions = Pick<
	CompileOptions,
	"sourcemap" | "compact" | "scopedStyleStrategy"
>;

export interface ProjectRecord {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	schemaVersion: 2;
	mode: ProjectMode;
	/** Path of the file the preview renders, e.g. `src/pages/index.astro`. */
	entry: string;
	/** Files keyed by normalised path (`src/components/Card.astro`). */
	files: Record<string, ProjectFile>;
	options: Partial<ProjectOptions>;
}

/** Phase 2 shape (one component); still found in IndexedDB, upgraded on read. */
export interface ProjectRecordV1 {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	schemaVersion: 1;
	source: string;
	options: Partial<ProjectOptions> & { filename?: string };
}

export type StoredProjectRecord = ProjectRecord | ProjectRecordV1;

export type ProjectSummary = Pick<
	ProjectRecord,
	"id" | "name" | "createdAt" | "updatedAt"
> & { mode: ProjectMode };

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
	/** The record, upgraded to the current schema. */
	get(id: string): Promise<ProjectRecord | undefined>;
	put(record: ProjectRecord): Promise<void>;
	/** Removes the project and its chat thread. */
	delete(id: string): Promise<void>;
	getChat(projectId: string): Promise<ChatRecord | undefined>;
	putChat(record: ChatRecord): Promise<void>;
}
