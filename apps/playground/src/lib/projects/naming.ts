// Default names for new and imported projects.
import type { ProjectSummary } from "./types";

const UNTITLED = "Untitled";

/** `Untitled 1`, `Untitled 2`, … skipping names that already exist. */
export function defaultProjectName(existing: ProjectSummary[]): string {
	const taken = new Set(existing.map((p) => p.name));
	let n = existing.length + 1;
	// Prefer the smallest free number so deleted slots are reused.
	for (let i = 1; i <= existing.length + 1; i++) {
		if (!taken.has(`${UNTITLED} ${i}`)) {
			n = i;
			break;
		}
	}
	return `${UNTITLED} ${n}`;
}

/** Name for a project created from a shared `#code=` URL. */
export function importedProjectName(filename: string | undefined): string {
	const base = (filename ?? "").trim() || "index.astro";
	return `Shared ${base}`;
}
