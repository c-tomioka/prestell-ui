// IndexedDB-backed `ProjectStore`. No library: one database, two object stores.
//
// Records are upgraded to the current schema when read (`upgradeProjectRecord`)
// instead of in `onupgradeneeded`: the shape changed in Phase 5 (one `source`
// → a `files` map) but no index did, so the database version stays at 1 and
// other open tabs are never blocked.
import { sortByUpdated, toSummary, upgradeProjectRecord } from "./record";
import type {
	ChatRecord,
	ProjectRecord,
	ProjectStore,
	ProjectSummary,
	StoredProjectRecord,
} from "./types";

export const DB_NAME = "prestell";
export const DB_VERSION = 1;
const PROJECTS = "projects";
const CHATS = "chats";

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () =>
			reject(req.error ?? new Error("IndexedDB request failed"));
	});
}

function complete(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () =>
			reject(tx.error ?? new Error("IndexedDB transaction failed"));
		tx.onabort = () =>
			reject(tx.error ?? new Error("IndexedDB transaction aborted"));
	});
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = factory.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(PROJECTS)) {
				const store = db.createObjectStore(PROJECTS, { keyPath: "id" });
				store.createIndex("updatedAt", "updatedAt");
			}
			if (!db.objectStoreNames.contains(CHATS)) {
				db.createObjectStore(CHATS, { keyPath: "projectId" });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () =>
			reject(req.error ?? new Error("Could not open IndexedDB"));
		req.onblocked = () =>
			reject(new Error("IndexedDB upgrade is blocked by another tab"));
	});
}

export class IdbProjectStore implements ProjectStore {
	#db: IDBDatabase;

	private constructor(db: IDBDatabase) {
		this.#db = db;
	}

	static async open(factory: IDBFactory = indexedDB): Promise<IdbProjectStore> {
		return new IdbProjectStore(await openDatabase(factory));
	}

	close(): void {
		this.#db.close();
	}

	async list(): Promise<ProjectSummary[]> {
		const tx = this.#db.transaction(PROJECTS, "readonly");
		const all = await request(
			tx.objectStore(PROJECTS).getAll() as IDBRequest<StoredProjectRecord[]>,
		);
		return sortByUpdated(all.map(toSummary));
	}

	async get(id: string): Promise<ProjectRecord | undefined> {
		const tx = this.#db.transaction(PROJECTS, "readonly");
		const stored = await request(
			tx.objectStore(PROJECTS).get(id) as IDBRequest<
				StoredProjectRecord | undefined
			>,
		);
		return stored && upgradeProjectRecord(stored);
	}

	async put(record: ProjectRecord): Promise<void> {
		const tx = this.#db.transaction(PROJECTS, "readwrite");
		tx.objectStore(PROJECTS).put(record);
		await complete(tx);
	}

	async delete(id: string): Promise<void> {
		const tx = this.#db.transaction([PROJECTS, CHATS], "readwrite");
		tx.objectStore(PROJECTS).delete(id);
		tx.objectStore(CHATS).delete(id);
		await complete(tx);
	}

	async getChat(projectId: string): Promise<ChatRecord | undefined> {
		const tx = this.#db.transaction(CHATS, "readonly");
		return request(
			tx.objectStore(CHATS).get(projectId) as IDBRequest<
				ChatRecord | undefined
			>,
		);
	}

	async putChat(record: ChatRecord): Promise<void> {
		const tx = this.#db.transaction(CHATS, "readwrite");
		tx.objectStore(CHATS).put(record);
		await complete(tx);
	}
}
