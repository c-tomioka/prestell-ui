import { describe, expect, it } from "vitest";
import { describeChatError } from "./errors";

describe("describeChatError", () => {
	it("unwraps the JSON body of an /api error response", () => {
		const info = describeChatError(
			new Error('{"ok":false,"error":"Invalid chat request: model too short"}'),
		);
		expect(info.message).toBe("Invalid chat request: model too short");
		expect(info.kind).toBe("request");
		expect(info.transient).toBe(false);
	});

	it("treats a local server that is not running as not transient", () => {
		const info = describeChatError(
			new Error(
				"Ollama に接続できません (http://localhost:11434/v1)。`ollama serve` を実行してから再試行してください。",
			),
		);
		expect(info.kind).toBe("local-down");
		expect(info.transient).toBe(false);
	});

	it("marks network, timeout, rate-limit and 5xx as transient", () => {
		expect(describeChatError(new Error("Failed to fetch")).kind).toBe(
			"network",
		);
		expect(describeChatError(new Error("The operation timed out")).kind).toBe(
			"timeout",
		);
		expect(describeChatError(new Error("429 Too Many Requests")).kind).toBe(
			"rate-limit",
		);
		expect(describeChatError(new Error("503 Service Unavailable")).kind).toBe(
			"server",
		);
		for (const text of [
			"Failed to fetch",
			"timed out",
			"rate limit exceeded",
			"Bad Gateway",
		]) {
			expect(describeChatError(new Error(text)).transient).toBe(true);
		}
	});

	it("falls back to unknown with a default message", () => {
		const info = describeChatError(new Error(""));
		expect(info.kind).toBe("unknown");
		expect(info.message).toBe("The request failed.");
		expect(info.transient).toBe(false);
	});
});
