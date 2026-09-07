import { describe, expect, it } from "vitest";
import { withRetry } from "./resilience";

describe("withRetry", () => {
	it("returns the first successful result without sleeping", async () => {
		const slept: number[] = [];
		const value = await withRetry(async () => "ok", {
			attempts: 3,
			delayMs: 100,
			sleep: async (ms) => void slept.push(ms),
		});
		expect(value).toBe("ok");
		expect(slept).toEqual([]);
	});

	it("retries up to `attempts` with a growing delay", async () => {
		const slept: number[] = [];
		const seen: number[] = [];
		const value = await withRetry(
			async (attempt) => {
				seen.push(attempt);
				if (attempt < 3) throw new Error(`fail ${attempt}`);
				return "third time";
			},
			{ attempts: 3, delayMs: 100, sleep: async (ms) => void slept.push(ms) },
		);
		expect(value).toBe("third time");
		expect(seen).toEqual([1, 2, 3]);
		expect(slept).toEqual([100, 200]);
	});

	it("throws the last error once attempts are exhausted", async () => {
		await expect(
			withRetry(
				async (attempt) => {
					throw new Error(`fail ${attempt}`);
				},
				{ attempts: 2, sleep: async () => {} },
			),
		).rejects.toThrow("fail 2");
	});

	it("stops immediately when shouldRetry says no", async () => {
		let calls = 0;
		await expect(
			withRetry(
				async () => {
					calls++;
					throw new Error("fatal");
				},
				{ attempts: 5, shouldRetry: () => false, sleep: async () => {} },
			),
		).rejects.toThrow("fatal");
		expect(calls).toBe(1);
	});
});
