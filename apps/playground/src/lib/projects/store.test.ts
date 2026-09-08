import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IdbProjectStore } from "./idb-store";
import { MemoryProjectStore } from "./memory-store";
import { defaultProjectName, importedProjectName } from "./naming";
import {
	createProjectRecord,
	persistableProposals,
	upgradeProjectRecord,
} from "./record";
import type { ProjectRecordV1, ProjectStore } from "./types";

const component = (source: string) => ({
	mode: "component" as const,
	entry: "Component.astro",
	files: { "Component.astro": source },
});

function contract(name: string, open: () => Promise<ProjectStore>) {
	describe(name, () => {
		it("lists projects most recently updated first", async () => {
			const store = await open();
			await store.put(
				createProjectRecord({
					id: "old",
					name: "Old",
					...component("a"),
					now: 1,
				}),
			);
			await store.put(
				createProjectRecord({
					id: "new",
					name: "New",
					...component("b"),
					now: 2,
				}),
			);
			const list = await store.list();
			expect(list.map((p) => p.id)).toEqual(["new", "old"]);
			expect(list[0]).not.toHaveProperty("files");
			expect(list[0].mode).toBe("component");
		});

		it("round-trips a project and replaces it on put", async () => {
			const store = await open();
			const record = createProjectRecord({
				id: "p",
				name: "P",
				mode: "page",
				entry: "src/pages/index.astro",
				files: {
					"src/pages/index.astro": "x",
					"src/styles/global.css": "body {}",
				},
				options: { compact: "html" },
			});
			await store.put(record);
			expect(await store.get("p")).toEqual(record);
			await store.put({
				...record,
				files: { ...record.files, "src/pages/index.astro": "y" },
				updatedAt: record.updatedAt + 1,
			});
			expect((await store.get("p"))?.files["src/pages/index.astro"]).toBe("y");
			expect(await store.get("missing")).toBeUndefined();
		});

		it("keeps chats separate and deletes them with the project", async () => {
			const store = await open();
			const record = createProjectRecord({
				id: "p",
				name: "P",
				...component("x"),
			});
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
			expect((await store.get("p"))?.files["Component.astro"]).toBe("x");
			await store.delete("p");
			expect(await store.get("p")).toBeUndefined();
			expect(await store.getChat("p")).toBeUndefined();
			expect(await store.list()).toEqual([]);
		});
	});
}

contract("MemoryProjectStore", async () => new MemoryProjectStore());
contract("IdbProjectStore", () => IdbProjectStore.open(new IDBFactory()));

describe("schema upgrade", () => {
	const v1: ProjectRecordV1 = {
		id: "old",
		name: "Old",
		createdAt: 1,
		updatedAt: 2,
		schemaVersion: 1,
		source: "<p>hi</p>",
		options: { filename: "Card.astro", compact: "html" },
	};

	it("turns a Phase 2 record into a Component project", () => {
		expect(upgradeProjectRecord(v1)).toEqual({
			id: "old",
			name: "Old",
			createdAt: 1,
			updatedAt: 2,
			schemaVersion: 2,
			mode: "component",
			entry: "Card.astro",
			files: { "Card.astro": "<p>hi</p>" },
			options: { compact: "html" },
		});
		expect(upgradeProjectRecord({ ...v1, options: {} }).entry).toBe(
			"index.astro",
		);
		const current = createProjectRecord({ name: "N", ...component("x") });
		expect(upgradeProjectRecord(current)).toBe(current);
	});

	it("is applied when reading from either store", async () => {
		const memory = new MemoryProjectStore();
		memory.putStored(v1);
		expect((await memory.get("old"))?.files).toEqual({
			"Card.astro": "<p>hi</p>",
		});
		expect((await memory.list())[0].mode).toBe("component");

		const factory = new IDBFactory();
		const idb = await IdbProjectStore.open(factory);
		// Write the old shape directly, as a Phase 2 build would have.
		await idb.put(v1 as unknown as Parameters<typeof idb.put>[0]);
		expect(await idb.get("old")).toEqual(upgradeProjectRecord(v1));
	});
});

describe("naming", () => {
	it("picks the smallest free Untitled number", () => {
		const base = { createdAt: 0, updatedAt: 0, mode: "component" as const };
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
