// Pure scoring and aggregation for the evaluation harness.
import type { KnowledgeCase } from "./cases";
import type { CodeRunResult, KnowledgeRunResult } from "./client";

export interface KnowledgeScore {
	correct: boolean;
	missing: string[];
	hallucinations: string[];
}

export function scoreKnowledge(
	text: string,
	testCase: KnowledgeCase,
): KnowledgeScore {
	const missing = testCase.must.filter((re) => !re.test(text)).map(String);
	const hallucinations = testCase.mustNot
		.filter((re) => re.test(text))
		.map(String);
	return {
		correct: missing.length === 0 && hallucinations.length === 0,
		missing,
		hallucinations,
	};
}

export interface GroupKey {
	provider: string;
	model: string;
	docsMode: string;
}

export interface CodeSummary extends GroupKey {
	n: number;
	fence: number;
	pass0: number;
	passed: number;
	unsupported: number;
	transportErrors: number;
	meanAttempts: number;
	meanLatencyMs: number;
}

export interface KnowledgeSummary extends GroupKey {
	n: number;
	correct: number;
	hallucinated: number;
	transportErrors: number;
	toolCalls: number;
	docsUnavailable: number;
	meanLatencyMs: number;
}

function keyOf(r: GroupKey): string {
	return `${r.provider} ${r.model} ${r.docsMode}`;
}

function groupBy<T extends GroupKey>(results: T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const r of results) {
		const key = keyOf(r);
		const list = groups.get(key);
		if (list) list.push(r);
		else groups.set(key, [r]);
	}
	return groups;
}

function mean(values: number[]): number {
	return values.length === 0
		? 0
		: values.reduce((a, b) => a + b, 0) / values.length;
}

export function aggregateCode(results: CodeRunResult[]): CodeSummary[] {
	return [...groupBy(results).values()].map((rows) => {
		const [{ provider, model, docsMode }] = rows;
		return {
			provider,
			model,
			docsMode,
			n: rows.length,
			fence: rows.filter((r) => r.fence).length,
			pass0: rows.filter((r) => r.pass0).length,
			passed: rows.filter((r) => r.passed).length,
			unsupported: rows.filter((r) => r.unsupported && !r.passed).length,
			transportErrors: rows.filter((r) => r.transport).length,
			meanAttempts: mean(rows.map((r) => r.attempts)),
			meanLatencyMs: mean(rows.map((r) => r.latencyMs)),
		};
	});
}

export function aggregateKnowledge(
	results: KnowledgeRunResult[],
): KnowledgeSummary[] {
	return [...groupBy(results).values()].map((rows) => {
		const [{ provider, model, docsMode }] = rows;
		return {
			provider,
			model,
			docsMode,
			n: rows.length,
			correct: rows.filter((r) => r.correct).length,
			hallucinated: rows.filter((r) => r.hallucinations.length > 0).length,
			transportErrors: rows.filter((r) => r.transport).length,
			toolCalls: rows.reduce((sum, r) => sum + r.toolCalls, 0),
			docsUnavailable: rows.filter((r) => r.notice).length,
			meanLatencyMs: mean(rows.map((r) => r.latencyMs)),
		};
	});
}

export interface MergeKey {
	provider: string;
	model: string;
	docsMode: string;
	caseId: string;
	transport?: string;
}

function mergeKey(r: MergeKey): string {
	return `${r.provider}|${r.model}|${r.docsMode}|${r.caseId}`;
}

/**
 * Merge a partial re-run into an existing record, one entry per
 * (model, docsMode, case). A fresh transport failure (rate limit, timeout)
 * never replaces an earlier real result, so a retry cannot lose data.
 */
export function mergeRuns<T extends MergeKey>(previous: T[], fresh: T[]): T[] {
	const merged = new Map(previous.map((r) => [mergeKey(r), r] as const));
	for (const r of fresh) {
		const key = mergeKey(r);
		const old = merged.get(key);
		if (r.transport && old && !old.transport) continue;
		merged.set(key, r);
	}
	return [...merged.values()];
}

/** Most frequent final error messages (first line only), for the report. */
export function topErrors(
	results: CodeRunResult[],
	limit = 8,
): Array<{ error: string; count: number }> {
	const counts = new Map<string, number>();
	for (const r of results) {
		if (r.passed) continue;
		const text = (r.transport ?? r.error ?? "unknown").split("\n")[0].trim();
		counts.set(text, (counts.get(text) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([error, count]) => ({ error, count }))
		.sort((a, b) => b.count - a.count || a.error.localeCompare(b.error))
		.slice(0, limit);
}
