import { describe, expect, it } from "vitest";
import { resolveInitialProject } from "./boot";
import type { ProjectSummary } from "./types";

const summaries: ProjectSummary[] = [
	{ id: "b", name: "B", createdAt: 2, updatedAt: 20 },
	{ id: "a", name: "A", createdAt: 1, updatedAt: 10 },
];

describe("resolveInitialProject", () => {
	it("imports a shared hash before anything else", () => {
		expect(
			resolveInitialProject({
				hash: { code: "<p/>", options: { filename: "x.astro" } },
				summaries,
				currentId: "a",
			}),
		).toEqual({
			kind: "import",
			code: "<p/>",
			options: { filename: "x.astro" },
		});
	});

	it("ignores a hash without code", () => {
		expect(
			resolveInitialProject({
				hash: { options: {} },
				summaries,
				currentId: "a",
			}),
		).toEqual({ kind: "open", id: "a" });
	});

	it("opens the last used project when it still exists", () => {
		expect(
			resolveInitialProject({ hash: null, summaries, currentId: "a" }),
		).toEqual({
			kind: "open",
			id: "a",
		});
	});

	it("falls back to the most recent project", () => {
		expect(
			resolveInitialProject({ hash: null, summaries, currentId: "gone" }),
		).toEqual({
			kind: "open",
			id: "b",
		});
	});

	it("creates a project when none exist", () => {
		expect(
			resolveInitialProject({ hash: null, summaries: [], currentId: null }),
		).toEqual({
			kind: "create",
		});
	});
});
