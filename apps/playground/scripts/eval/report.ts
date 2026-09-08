// Markdown rendering for the evaluation record (docs/evaluations/<date>.md).
import type { ChatTarget, CodeRunResult, KnowledgeRunResult } from "./client";
import { aggregateCode, aggregateKnowledge, topErrors } from "./score";

export interface ReportInput {
	date: string;
	baseUrl: string;
	targets: ChatTarget[];
	skipped: string[];
	docsModes: string[];
	code: CodeRunResult[];
	/** Page / Site cases (Phase 5); optional for older records. */
	project?: CodeRunResult[];
	knowledge: KnowledgeRunResult[];
	durationMs: number;
}

function pct(part: number, total: number): string {
	return total === 0 ? "-" : `${Math.round((part / total) * 100)}%`;
}

function sec(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function cell(text: string): string {
	return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function modelLabel(provider: string, model: string): string {
	return `${provider} / ${model}`;
}

export function renderReport(input: ReportInput): string {
	const codeRows = aggregateCode(input.code);
	const knowledgeRows = aggregateKnowledge(input.knowledge);
	const lines: string[] = [];
	lines.push(`# 評価記録（${input.date}）`, "");
	lines.push(
		`\`pnpm eval\` の自動生成レポート。dev サーバー ${input.baseUrl}、docsMode: ${input.docsModes.join(" / ")}、所要 ${sec(input.durationMs)}。`,
		"",
	);
	lines.push("対象モデル:", "");
	for (const t of input.targets)
		lines.push(`- ${modelLabel(t.provider, t.model)}`);
	if (input.skipped.length > 0) {
		lines.push("", "対象外:", "");
		for (const s of input.skipped) lines.push(`- ${s}`);
	}

	lines.push("", "## コード生成（検証合格率）", "");
	lines.push(
		"pass@0 = 初回の返答が `validateProposal` 相当の検証に合格、pass@fix = fix ループ（最大 2 回）後に合格、非対応 = import / client:* などプレビュー非対応構文で最終的に落ちた件数。",
		"",
	);
	lines.push(
		"| モデル | docsMode | n | fence | pass@0 | pass@fix | 平均 fix | 非対応 | 通信失敗 | 平均時間 |",
		"|---|---|---|---|---|---|---|---|---|---|",
	);
	for (const r of codeRows) {
		lines.push(
			`| ${cell(modelLabel(r.provider, r.model))} | ${r.docsMode} | ${r.n} | ${pct(r.fence, r.n)} | ${pct(r.pass0, r.n)} | ${pct(r.passed, r.n)} | ${r.meanAttempts.toFixed(2)} | ${r.unsupported} | ${r.transportErrors} | ${sec(r.meanLatencyMs)} |`,
		);
	}

	const project = input.project ?? [];
	if (project.length > 0) {
		lines.push("", "## 多ファイル生成（Page / Site モード、検証合格率）", "");
		lines.push(
			"パス付きコードブロックを取り出し（`extractProposalFiles`）、`validateProjectProposal` 相当の検証（パス規則・各ファイルのコンパイル・入口ページのグラフ構築）にかける。列の意味はコード生成と同じ。",
			"",
		);
		lines.push(
			"| モデル | docsMode | n | fence | pass@0 | pass@fix | 平均 fix | 非対応 | 通信失敗 | 平均時間 |",
			"|---|---|---|---|---|---|---|---|---|---|",
		);
		for (const r of aggregateCode(project)) {
			lines.push(
				`| ${cell(modelLabel(r.provider, r.model))} | ${r.docsMode} | ${r.n} | ${pct(r.fence, r.n)} | ${pct(r.pass0, r.n)} | ${pct(r.passed, r.n)} | ${r.meanAttempts.toFixed(2)} | ${r.unsupported} | ${r.transportErrors} | ${sec(r.meanLatencyMs)} |`,
			);
		}
	}

	const errors = topErrors([...input.code, ...project]);
	if (errors.length > 0) {
		lines.push(
			"",
			"### 失敗理由（上位）",
			"",
			"| 件数 | エラー |",
			"|---|---|",
		);
		for (const e of errors) lines.push(`| ${e.count} | ${cell(e.error)} |`);
	}

	lines.push("", "## Astro 知識問答（ハルシネーション検出）", "");
	lines.push(
		"correct = 期待語がすべて含まれ、旧 API / 存在しない API に一致しない。hallucinated = 旧 API / 存在しない API に 1 つ以上一致。採点は正規表現による機械採点。",
		"",
	);
	lines.push(
		"| モデル | docsMode | n | correct | hallucinated | tool 呼び出し | docs 不可 | 通信失敗 | 平均時間 |",
		"|---|---|---|---|---|---|---|---|---|",
	);
	for (const r of knowledgeRows) {
		lines.push(
			`| ${cell(modelLabel(r.provider, r.model))} | ${r.docsMode} | ${r.n} | ${pct(r.correct, r.n)} | ${r.hallucinated} | ${r.toolCalls} | ${r.docsUnavailable} | ${r.transportErrors} | ${sec(r.meanLatencyMs)} |`,
		);
	}

	lines.push("", "### 知識問答の明細（不正解のみ）", "");
	const wrong = input.knowledge.filter((r) => !r.correct);
	if (wrong.length === 0) lines.push("なし");
	else {
		lines.push(
			"| モデル | docsMode | ケース | 欠落 | ハルシネーション | 通信失敗 | 抜粋 |",
			"|---|---|---|---|---|---|---|",
		);
		for (const r of wrong) {
			lines.push(
				`| ${cell(modelLabel(r.provider, r.model))} | ${r.docsMode} | ${r.caseId} | ${cell(r.missing.join(", "))} | ${cell(r.hallucinations.join(", "))} | ${cell(r.transport ?? "")} | ${cell(r.excerpt.slice(0, 120))} |`,
			);
		}
	}

	lines.push("", "### コード生成の明細（不合格のみ）", "");
	const failed = [...input.code, ...project].filter((r) => !r.passed);
	if (failed.length === 0) lines.push("なし");
	else {
		lines.push(
			"| モデル | docsMode | ケース | fence | fix | エラー |",
			"|---|---|---|---|---|---|",
		);
		for (const r of failed) {
			lines.push(
				`| ${cell(modelLabel(r.provider, r.model))} | ${r.docsMode} | ${r.kind === "project" ? "project/" : ""}${r.caseId} | ${r.fence ? "yes" : "no"} | ${r.attempts} | ${cell((r.transport ?? r.error ?? "").slice(0, 160))} |`,
			);
		}
	}
	lines.push("");
	return lines.join("\n");
}
