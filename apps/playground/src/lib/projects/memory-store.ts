// In-memory `ProjectStore`: fallback when IndexedDB is unavailable, and the
// reference implementation for the store contract tests.
import { sortByUpdated, toSummary } from "./record";
import type {
	ChatRecord,
	ProjectRecord,
	ProjectStore,
	ProjectSummary,
} from "./types";

export class MemoryProjectStore implements ProjectStore {
	#projects = new Map<string, ProjectRecord>();
	#chats = new Map<string, ChatRecord>();

	async list(): Promise<ProjectSummary[]> {
		return sortByUpdated([...this.#projects.values()].map(toSummary));
	}

	async get(id: string): Promise<ProjectRecord | undefined> {
		const record = this.#projects.get(id);
		return record ? structuredClone(record) : undefined;
	}

	async put(record: ProjectRecord): Promise<void> {
		this.#projects.set(record.id, structuredClone(record));
	}

	async delete(id: string): Promise<void> {
		this.#projects.delete(id);
		this.#chats.delete(id);
	}

	async getChat(projectId: string): Promise<ChatRecord | undefined> {
		const record = this.#chats.get(projectId);
		return record ? structuredClone(record) : undefined;
	}

	async putChat(record: ChatRecord): Promise<void> {
		this.#chats.set(record.projectId, structuredClone(record));
	}
}
