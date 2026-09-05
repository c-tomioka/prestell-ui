// Remember the last opened project per browser (localStorage, same pattern as
// `ai/settings.ts`): a convenience only, so every failure falls back to null.
const STORAGE_KEY = "prestell.projects.current";

export function loadCurrentProjectId(): string | null {
	if (typeof localStorage === "undefined") return null;
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

export function saveCurrentProjectId(id: string): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, id);
	} catch {
		// Storage can be unavailable (private mode).
	}
}
