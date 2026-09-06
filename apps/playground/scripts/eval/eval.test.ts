// Evaluation harness (ROADMAP Phase 2): generation quality per model and the
// effect of docsMode on Astro hallucinations. Runs only with PRESTELL_EVAL=1
// against a running dev server: `pnpm eval` (see docs/EVALUATION.md).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";
import { CODE_CASES, KNOWLEDGE_CASES } from "./cases";
import {
	type ChatTarget,
	type CodeRunResult,
	type DocsMode,
	discoverTargets,
	type KnowledgeRunResult,
	runCodeCase,
	runKnowledgeCase,
} from "./client";
import { renderReport } from "./report";
import { mergeRuns } from "./score";

const ENABLED = process.env.PRESTELL_EVAL === "1";
const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:4321";
const DATE = process.env.EVAL_DATE ?? new Date().toISOString().slice(0, 10);
const DOCS_MODES = (process.env.EVAL_DOCS_MODES ?? "off,inject,tools")
	.split(",")
	.map((s) => s.trim())
	.filter((s): s is DocsMode => s === "off" || s === "inject" || s === "tools");
const DEFAULT_MODELS = [
	"anthropic:claude-haiku-4.5",
	"workers-ai:@cf/meta/llama-4-scout-17b-16e-instruct",
	"workers-ai:@cf/qwen/qwen2.5-coder-32b-instruct",
];
const REQUESTED: ChatTarget[] = (
	process.env.EVAL_MODELS ?? DEFAULT_MODELS.join(",")
)
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean)
	.map((s) => {
		const index = s.indexOf(":");
		return { provider: s.slice(0, index), model: s.slice(index + 1) };
	});
const CASE_FILTER = process.env.EVAL_CASES?.split(",")
	.map((s) => s.trim())
	.filter(Boolean);
/** Replace matching (model, docsMode, case) entries in today's record instead of starting over. */
const MERGE = process.env.EVAL_MERGE === "1";

interface RawRecord {
	targets?: ChatTarget[];
	skipped?: string[];
	code: CodeRunResult[];
	knowledge: KnowledgeRunResult[];
}

/** Group targets by provider so one provider's rate limit is not hit from two workers at once. */
function byProvider(targets: ChatTarget[]): ChatTarget[][] {
	const groups = new Map<string, ChatTarget[]>();
	for (const t of targets) {
		const list = groups.get(t.provider);
		if (list) list.push(t);
		else groups.set(t.provider, [t]);
	}
	return [...groups.values()];
}

function log(message: string) {
	console.log(`[eval ${new Date().toISOString().slice(11, 19)}] ${message}`);
}

async function runTarget(target: ChatTarget) {
	const label = `${target.provider}/${target.model}`;
	const code: CodeRunResult[] = [];
	const knowledge: KnowledgeRunResult[] = [];
	for (const docsMode of DOCS_MODES) {
		for (const testCase of CODE_CASES) {
			if (CASE_FILTER && !CASE_FILTER.includes(testCase.id)) continue;
			const r = await runCodeCase(BASE_URL, target, docsMode, testCase);
			code.push(r);
			log(
				`${label} ${docsMode} code/${testCase.id}: ${r.passed ? "pass" : "FAIL"} (fix ${r.attempts}, ${(r.latencyMs / 1000).toFixed(1)}s)${r.transport ? ` transport=${r.transport}` : ""}`,
			);
		}
		for (const testCase of KNOWLEDGE_CASES) {
			if (CASE_FILTER && !CASE_FILTER.includes(testCase.id)) continue;
			const r = await runKnowledgeCase(BASE_URL, target, docsMode, testCase);
			knowledge.push(r);
			log(
				`${label} ${docsMode} know/${testCase.id}: ${r.correct ? "ok" : "WRONG"}${r.hallucinations.length ? ` halluc=${r.hallucinations.join("|")}` : ""}${r.missing.length ? ` missing=${r.missing.join("|")}` : ""} (${(r.latencyMs / 1000).toFixed(1)}s)`,
			);
		}
	}
	return { code, knowledge };
}

describe.skipIf(!ENABLED)("evaluation harness", () => {
	it("runs every target and writes the report", async () => {
		const started = performance.now();
		const discovery = await discoverTargets(BASE_URL, REQUESTED);
		log(
			`targets: ${discovery.targets.map((t) => `${t.provider}:${t.model}`).join(", ") || "(none)"}`,
		);
		for (const s of discovery.skipped) log(`skipped: ${s}`);
		if (discovery.targets.length === 0)
			throw new Error("No targets available.");

		// Providers run in parallel; targets of the same provider run one after another.
		const perProvider = await Promise.all(
			byProvider(discovery.targets).map(async (group) => {
				const out: Array<Awaited<ReturnType<typeof runTarget>>> = [];
				for (const target of group) out.push(await runTarget(target));
				return out;
			}),
		);
		let code = perProvider.flat().flatMap((t) => t.code);
		let knowledge = perProvider.flat().flatMap((t) => t.knowledge);
		const durationMs = Math.round(performance.now() - started);

		const rawDir = resolve(process.cwd(), ".eval");
		mkdirSync(rawDir, { recursive: true });
		const rawPath = resolve(rawDir, `${DATE}.json`);
		let targets = discovery.targets;
		let skipped = discovery.skipped;
		if (MERGE && existsSync(rawPath)) {
			const previous = JSON.parse(readFileSync(rawPath, "utf8")) as RawRecord;
			code = mergeRuns(previous.code ?? [], code);
			knowledge = mergeRuns(previous.knowledge ?? [], knowledge);
			const seen = new Set(targets.map((t) => `${t.provider}:${t.model}`));
			targets = [
				...(previous.targets ?? []).filter(
					(t) => !seen.has(`${t.provider}:${t.model}`),
				),
				...targets,
			];
			skipped = [...new Set([...(previous.skipped ?? []), ...skipped])];
			log(
				`merged into existing record (${previous.code?.length ?? 0} code / ${previous.knowledge?.length ?? 0} knowledge entries before)`,
			);
		}

		const raw = {
			date: DATE,
			baseUrl: BASE_URL,
			docsModes: DOCS_MODES,
			targets,
			skipped,
			discovery,
			code,
			knowledge,
			durationMs,
		};
		writeFileSync(rawPath, JSON.stringify(raw, null, "\t"));

		const reportDir = resolve(process.cwd(), "../../docs/evaluations");
		mkdirSync(reportDir, { recursive: true });
		const reportPath = resolve(reportDir, `${DATE}.md`);
		writeFileSync(
			reportPath,
			renderReport({
				date: DATE,
				baseUrl: BASE_URL,
				targets,
				skipped,
				docsModes: DOCS_MODES,
				code,
				knowledge,
				durationMs,
			}),
		);
		log(
			`wrote ${rawPath} and ${reportPath} in ${(durationMs / 1000).toFixed(0)}s`,
		);
	});
});
