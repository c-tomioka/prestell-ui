// Decide which project to show on startup. Pure so the priority order is
// testable: shared URL hash > last opened project > most recent > new project.
import type { SharedState } from "../share";
import type { ProjectSummary } from "./types";

export type InitialProject =
	| { kind: "import"; code: string; options: SharedState["options"] }
	| { kind: "open"; id: string }
	| { kind: "create" };

export function resolveInitialProject(input: {
	hash: SharedState | null;
	summaries: ProjectSummary[];
	currentId: string | null;
}): InitialProject {
	const { hash, summaries, currentId } = input;
	if (hash?.code !== undefined && hash.code !== "") {
		return { kind: "import", code: hash.code, options: hash.options };
	}
	if (currentId && summaries.some((p) => p.id === currentId)) {
		return { kind: "open", id: currentId };
	}
	const latest = summaries[0];
	if (latest) return { kind: "open", id: latest.id };
	return { kind: "create" };
}
