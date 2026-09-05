// Persisted preference: render the Preview automatically after every edit, or
// only when the user presses the refresh button. Rendering is the one step
// that calls the server, so this is the main knob for cost and for calm typing.

const STORAGE_KEY = "prestell.preview.auto";

export function loadAutoPreview(): boolean {
	if (typeof localStorage === "undefined") return true;
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		return saved === null ? true : saved === "true";
	} catch {
		return true;
	}
}

export function saveAutoPreview(value: boolean): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, String(value));
	} catch {
		// Storage can be unavailable (private mode); the preference is a convenience only.
	}
}
