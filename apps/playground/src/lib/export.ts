// Save the current component to the local disk.
//
// Chromium exposes the File System Access API (`showSaveFilePicker`), which
// lets the user pick a real path. Other browsers fall back to a download link.

interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

interface FileSystemWritableFileStreamLike {
	write(data: string | Blob): Promise<void>;
	close(): Promise<void>;
}

interface FileSystemFileHandleLike {
	createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

type ShowSaveFilePicker = (
	options?: SaveFilePickerOptions,
) => Promise<FileSystemFileHandleLike>;

function savePicker(): ShowSaveFilePicker | undefined {
	if (typeof window === "undefined") return undefined;
	const picker = (
		window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }
	).showSaveFilePicker;
	return typeof picker === "function" ? picker.bind(window) : undefined;
}

export function supportsFileSystemAccess(): boolean {
	return savePicker() !== undefined;
}

export function normalizeFilename(filename: string): string {
	const trimmed =
		filename.trim().replace(/[\\/:*?"<>|]/g, "-") || "index.astro";
	return trimmed.endsWith(".astro") ? trimmed : `${trimmed}.astro`;
}

export type SaveResult = "saved" | "downloaded" | "cancelled";

/** Write `source` to disk; resolves with how it was saved. */
export async function saveComponent(
	source: string,
	filename: string,
): Promise<SaveResult> {
	const name = normalizeFilename(filename);
	const picker = savePicker();
	if (picker) {
		try {
			const handle = await picker({
				suggestedName: name,
				types: [
					{
						description: "Astro component",
						accept: { "text/plain": [".astro"] },
					},
				],
			});
			const writable = await handle.createWritable();
			await writable.write(source);
			await writable.close();
			return "saved";
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				return "cancelled";
			}
			throw error;
		}
	}

	const blob = new Blob([source], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	try {
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = name;
		anchor.rel = "noopener";
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
	} finally {
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	return "downloaded";
}
