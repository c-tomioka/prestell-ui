import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
	buildFixPrompt,
	clampFixAttempts,
	isFixMessage,
	pendingFixAttempts,
} from "./fix-loop";

let seq = 0;
function user(text: string, fix?: { attempt: number; max: number }): UIMessage {
	return {
		id: `m${++seq}`,
		role: "user",
		parts: [{ type: "text", text }],
		metadata: fix ? { kind: "fix", ...fix } : undefined,
	};
}
function assistant(text: string): UIMessage {
	return {
		id: `m${++seq}`,
		role: "assistant",
		parts: [{ type: "text", text }],
	};
}

describe("pendingFixAttempts", () => {
	it("is 0 with no fix messages", () => {
		expect(pendingFixAttempts([])).toBe(0);
		expect(pendingFixAttempts([user("hi"), assistant("code")])).toBe(0);
	});

	it("counts trailing fix requests in the current chain", () => {
		const messages = [
			user("make a card"),
			assistant("bad code"),
			user("fix", { attempt: 1, max: 2 }),
			assistant("still bad"),
			user("fix", { attempt: 2, max: 2 }),
			assistant("bad again"),
		];
		expect(pendingFixAttempts(messages)).toBe(2);
	});

	it("resets when the user sends a manual message", () => {
		const messages = [
			user("make a card"),
			assistant("bad code"),
			user("fix", { attempt: 1, max: 2 }),
			assistant("bad"),
			user("try a different layout"),
			assistant("bad"),
		];
		expect(pendingFixAttempts(messages)).toBe(0);
	});
});

describe("isFixMessage", () => {
	it("only matches user messages with fix metadata", () => {
		expect(isFixMessage(user("x", { attempt: 1, max: 2 }))).toBe(true);
		expect(isFixMessage(user("x"))).toBe(false);
		expect(isFixMessage(assistant("x"))).toBe(false);
	});
});

describe("buildFixPrompt", () => {
	it("includes the error and the single-code-block contract", () => {
		const prompt = buildFixPrompt("Unexpected token (line 3)", 1, 2);
		expect(prompt).toContain("Unexpected token (line 3)");
		expect(prompt).toContain("attempt 1/2");
		expect(prompt).toContain("ONE fenced code block tagged `astro`");
		expect(prompt).toContain("not the editor contents");
	});
});

describe("clampFixAttempts", () => {
	it("clamps to 1..5 and defaults invalid input", () => {
		expect(clampFixAttempts(0)).toBe(1);
		expect(clampFixAttempts(9)).toBe(5);
		expect(clampFixAttempts(3)).toBe(3);
		expect(clampFixAttempts(undefined)).toBe(2);
		expect(clampFixAttempts("x")).toBe(2);
	});
});
