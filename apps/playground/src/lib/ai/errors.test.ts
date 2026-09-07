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

	it("composes the text for a coded error from the stream", () => {
		const info = describeChatError(
			new Error(
				'{"code":"local-unreachable","provider":"ollama","base":"http://localhost:11434/v1"}',
			),
		);
		expect(info.kind).toBe("local-down");
		expect(info.transient).toBe(false);
		expect(info.message).toBe(
			"Cannot reach Ollama at http://localhost:11434/v1. Run `ollama serve`, then retry.",
		);
	});

	it("reads a coded error from the errorResponse envelope", () => {
		const info = describeChatError(
			new Error(
				'{"ok":false,"error":"timeout","coded":{"code":"timeout","detail":"The operation timed out"}}',
			),
		);
		expect(info.kind).toBe("timeout");
		expect(info.transient).toBe(true);
		expect(info.message).toContain("did not respond in time");
	});

	it("still recognises a plain local-server message", () => {
		const info = describeChatError(
			new Error("Cannot reach LM Studio at http://localhost:1234/v1."),
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

	it("classifies direct-mode provider errors by status", () => {
		const limited = describeChatError(
			'{"code":"provider-error","provider":"google","status":429,"detail":"quota"}',
		);
		expect(limited.kind).toBe("rate-limit");
		expect(limited.transient).toBe(true);
		expect(limited.message).toContain("rate limiting");
		const outage = describeChatError(
			'{"code":"provider-error","provider":"anthropic","status":529,"detail":"overloaded"}',
		);
		expect(outage.kind).toBe("server");
		expect(outage.transient).toBe(true);
		const bad = describeChatError(
			'{"code":"provider-error","provider":"ollama","status":404,"detail":"model not found"}',
		);
		expect(bad.kind).toBe("request");
		expect(bad.message).toBe("Ollama returned HTTP 404: model not found.");
	});

	it("explains providers the browser cannot call", () => {
		const info = describeChatError(
			'{"code":"direct-unsupported","provider":"workers-ai"}',
		);
		expect(info.kind).toBe("request");
		expect(info.message).toContain("Switch Connection to Server");
	});
});
