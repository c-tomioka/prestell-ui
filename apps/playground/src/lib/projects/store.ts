// Lazily opened, shared `ProjectStore` for the app (IndexedDB, falling back to
// memory when the browser refuses it). Same singleton style as `compiler` and
// `preview`, but async because opening a database is.
import { IdbProjectStore } from "./idb-store";
import { MemoryProjectStore } from "./memory-store";
import type { ProjectStore } from "./types";

let pending: Promise<ProjectStore> | undefined;

export function openProjectStore(): Promise<ProjectStore> {
	if (!pending) {
		pending = (async () => {
			if (typeof indexedDB === "undefined") return new MemoryProjectStore();
			try {
				return await IdbProjectStore.open();
			} catch (error) {
				console.warn(
					"[projects] IndexedDB unavailable, using memory store:",
					error,
				);
				return new MemoryProjectStore();
			}
		})();
	}
	return pending;
}
