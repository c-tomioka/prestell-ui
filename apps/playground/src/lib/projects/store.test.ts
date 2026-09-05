import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IdbProjectStore } from "./idb-store";
import { MemoryProjectStore } from "./memory-store";
import { defaultProjectName, importedProjectName } from "./naming";
import { createProjectRecord, persistableProposals } from "./record";
import type { ProjectStore } from "./types";

function contract(name: string, open: () => Promise<ProjectStore>) {
	describe(name, () => {
		it("lists projects most recently updated first", async () => {
			const store = await open();
			await store.put(
				createProjectRecord({ id: "old", name: "Old", source: "a", now: 1 }),
			);
			await store.put(
				createProjectRecord({ id: "new", name: "New", source: "b", now: 2 }),
			);
			const list = await store.list();
			expect(list.map((p) => p.id)).toEqual(["new", "old"]);
			expect(list[0]).not.toHaveProperty("source");
		});

		it("round-trips a project and replaces it on put", async () => {
			const store = await open();
			const record = createProjectRecord({
				id: "p",
				name: "P",
				source: "x",
				options: { filename: "P.astro" },
			});
			await store.put(record);
			expect(await store.get("p")).toEqual(record);
			await store.put({
				...record,
				source: "y",
				updatedAt: record.updatedAt + 1,
			});
			expect((await store.get("p"))?.source).toBe("y");
			expect(await store.get("missing")).toBeUndefined();
		});

		it("keeps chats separate and deletes them with the project", async () => {
			const store = await open();
			const record = createProjectRecord({ id: "p", name: "P", source: "x" });
			await store.put(record);
			await store.putChat({
				projectId: "p",
				messages: [
					{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
				],
				proposals: { m2: { code: "<p/>", status: "valid" } },
				updatedAt: 5,
			});
			expect((await store.getChat("p"))?.messages).toHaveLength(1);
			// Writing the chat does not disturb the project record.
			expect((await store.get("p"))?.source).toBe("x");
			await store.delete("p");
			expect(await store.get("p")).toBeUndefined();
			expect(await store.getChat("p")).toBeUndefined();
			expect(await store.list()).toEqual([]);
		});
	});
}

contract("MemoryProjectStore", async () => new MemoryProjectStore());
contract("IdbProjectStore", () => IdbProjectStore.open(new IDBFactory()));

describe("naming", () => {
	it("picks the smallest free Untitled number", () => {
		const base = { createdAt: 0, updatedAt: 0 };
		expect(defaultProjectName([])).toBe("Untitled 1");
		expect(defaultProjectName([{ id: "1", name: "Untitled 1", ...base }])).toBe(
			"Untitled 2",
		);
		expect(
			defaultProjectName([
				{ id: "2", name: "Untitled 2", ...base },
				{ id: "x", name: "Custom", ...base },
			]),
		).toBe("Untitled 1");
		expect(importedProjectName(undefined)).toBe("Shared index.astro");
		expect(importedProjectName("Card.astro")).toBe("Shared Card.astro");
	});
});

describe("persistableProposals", () => {
	it("drops in-flight proposals and closes open retries", () => {
		const kept = persistableProposals({
			a: { code: "1", status: "streaming" },
			b: { code: "2", status: "validating" },
			c: { code: "3", status: "applied" },
			d: {
				code: "4",
				status: "invalid",
				error: "e",
				fix: { attempt: 1, max: 2, state: "retrying" },
			},
		});
		expect(Object.keys(kept)).toEqual(["c", "d"]);
		expect(kept.d.fix?.state).toBe("gave-up");
	});
});
