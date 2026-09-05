import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { trimForRequest } from "./history";

function msg(role: "user" | "assistant", i: number): UIMessage {
	return { id: `m${i}`, role, parts: [{ type: "text", text: String(i) }] };
}

describe("trimForRequest", () => {
	it("returns the same array when within the limit", () => {
		const messages = [msg("user", 1), msg("assistant", 2)];
		expect(trimForRequest(messages, 40)).toBe(messages);
	});

	it("keeps the most recent messages and starts with a user turn", () => {
		const messages: UIMessage[] = [];
		for (let i = 1; i <= 10; i++)
			messages.push(msg(i % 2 === 1 ? "user" : "assistant", i));
		const trimmed = trimForRequest(messages, 4);
		// Last 4 are 7,8,9,10 → starts with user 7.
		expect(trimmed.map((m) => m.id)).toEqual(["m7", "m8", "m9", "m10"]);
		const trimmed2 = trimForRequest(messages, 3);
		// Last 3 are 8,9,10 → drop leading assistant 8.
		expect(trimmed2.map((m) => m.id)).toEqual(["m9", "m10"]);
		expect(trimmed2[0].role).toBe("user");
	});
});
