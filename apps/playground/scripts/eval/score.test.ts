import { describe, expect, it } from "vitest";
import type { CodeRunResult, KnowledgeRunResult } from "./client";
import { renderReport } from "./report";
import {
	aggregateCode,
	aggregateKnowledge,
	mergeRuns,
	scoreKnowledge,
	topErrors,
} from "./score";

describe("scoreKnowledge", () => {
	const testCase = {
		id: "vt",
		prompt: "",
		must: [/ClientRouter/, /astro:transitions/],
		mustNot: [/<ViewTransitions/],
	};

	it("is correct when all must-patterns match and none of mustNot", () => {
		const s = scoreKnowledge(
			"import { ClientRouter } from 'astro:transitions';",
			testCase,
		);
		expect(s).toEqual({ correct: true, missing: [], hallucinations: [] });
	});

	it("reports missing and hallucinated patterns", () => {
		const s = scoreKnowledge(
			"Use <ViewTransitions /> from astro:transitions",
			testCase,
		);
		expect(s.correct).toBe(false);
		expect(s.missing).toEqual(["/ClientRouter/"]);
		expect(s.hallucinations).toEqual(["/<ViewTransitions/"]);
	});
});

function code(partial: Partial<CodeRunResult>): CodeRunResult {
	return {
		kind: "code",
		caseId: "card",
		provider: "workers-ai",
		model: "m",
		docsMode: "off",
		fence: true,
		pass0: false,
		passed: false,
		attempts: 0,
		unsupported: false,
		toolCalls: 0,
		latencyMs: 1000,
		chars: 100,
		...partial,
	};
}

function knowledge(partial: Partial<KnowledgeRunResult>): KnowledgeRunResult {
	return {
		kind: "knowledge",
		caseId: "vt",
		provider: "anthropic",
		model: "haiku",
		docsMode: "tools",
		correct: true,
		missing: [],
		hallucinations: [],
		toolCalls: 1,
		latencyMs: 2000,
		chars: 300,
		excerpt: "...",
		...partial,
	};
}

describe("aggregation", () => {
	it("summarises code results per model and docsMode", () => {
		const rows = aggregateCode([
			code({ pass0: true, passed: true }),
			code({ passed: true, attempts: 1, latencyMs: 3000 }),
			code({
				error: "Imports are not supported in Preview: x",
				unsupported: true,
				attempts: 2,
			}),
			code({ docsMode: "inject", transport: "HTTP 500: boom" }),
		]);
		expect(rows).toHaveLength(2);
		const off = rows.find((r) => r.docsMode === "off");
		expect(off).toMatchObject({
			n: 3,
			pass0: 1,
			passed: 2,
			unsupported: 1,
			transportErrors: 0,
		});
		expect(off?.meanAttempts).toBeCloseTo(1);
		expect(rows.find((r) => r.docsMode === "inject")).toMatchObject({
			n: 1,
			transportErrors: 1,
		});
	});

	it("summarises knowledge results and counts hallucinations", () => {
		const rows = aggregateKnowledge([
			knowledge({}),
			knowledge({
				correct: false,
				hallucinations: ["/<ViewTransitions/"],
				toolCalls: 0,
			}),
			knowledge({
				correct: false,
				transport: "timeout",
				notice: "docs unavailable",
			}),
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			n: 3,
			correct: 1,
			hallucinated: 1,
			transportErrors: 1,
			toolCalls: 2,
			docsUnavailable: 1,
		});
	});

	it("ranks the most frequent failure messages", () => {
		const errors = topErrors([
			code({ error: "A\nmore" }),
			code({ error: "A" }),
			code({ transport: "B" }),
			code({ passed: true, error: "ignored" }),
		]);
		expect(errors).toEqual([
			{ error: "A", count: 2 },
			{ error: "B", count: 1 },
		]);
	});
});

describe("mergeRuns", () => {
	it("replaces matching entries but keeps a real result over a fresh transport failure", () => {
		const previous = [
			code({ caseId: "card", passed: true }),
			code({ caseId: "hero", transport: "HTTP 500" }),
			code({ caseId: "pricing", docsMode: "inject", passed: true }),
		];
		const fresh = [
			code({ caseId: "card", transport: "Too Many Requests" }),
			code({ caseId: "hero", passed: true }),
			code({ caseId: "navbar", passed: true }),
		];
		const merged = mergeRuns(previous, fresh).map(
			(r) =>
				`${r.docsMode}/${r.caseId}:${r.passed ? "pass" : (r.transport ?? "fail")}`,
		);
		expect(merged.sort()).toEqual([
			"inject/pricing:pass",
			"off/card:pass",
			"off/hero:pass",
			"off/navbar:pass",
		]);
	});
});

describe("renderReport", () => {
	it("renders the summary tables and details", () => {
		const md = renderReport({
			date: "2026-09-06",
			baseUrl: "http://localhost:4321",
			targets: [{ provider: "anthropic", model: "haiku" }],
			skipped: ["ollama (no models loaded)"],
			docsModes: ["off", "tools"],
			code: [
				code({ pass0: true, passed: true }),
				code({ error: "Expected `>` (line 9)" }),
			],
			knowledge: [
				knowledge({}),
				knowledge({ correct: false, missing: ["/ClientRouter/"] }),
			],
			durationMs: 61_000,
		});
		expect(md).toContain("# 評価記録（2026-09-06）");
		expect(md).toContain("| workers-ai / m | off | 2 | 100% | 50% | 50% |");
		expect(md).toContain("| anthropic / haiku | tools | 2 | 50% | 0 | 2 |");
		expect(md).toContain("ollama (no models loaded)");
		expect(md).toContain("Expected `>` (line 9)");
		expect(md).toContain("/ClientRouter/");
	});
});
