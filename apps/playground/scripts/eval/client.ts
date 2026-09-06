// Talks to the running dev server's /api/chat and /api/models, and validates
// generated code with the native Astro compiler (same checks as apply.ts).
import { compileAstroSync, parseAstroSync } from "@astrojs/compiler-binding";
import type { ProposalValidation } from "../../src/lib/ai/apply";
import { extractAstroCode } from "../../src/lib/ai/extract-code";
import { buildFixPrompt } from "../../src/lib/ai/fix-loop";
import { formatCompilerErrors } from "../../src/lib/ai/format-diagnostics";
import { validatePreview } from "../../src/lib/preview";
import type { CodeCase, KnowledgeCase } from "./cases";
import { scoreKnowledge } from "./score";

export type DocsMode = "off" | "inject" | "tools";

export interface ChatTarget {
	provider: string;
	model: string;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	parts: Array<{ type: "text"; text: string }>;
	metadata?: unknown;
}

export interface ChatResult {
	text: string;
	/** Transport failure or `error` chunk. */
	error?: string;
	finishReason?: string;
	toolCalls: string[];
	notices: string[];
	latencyMs: number;
}

export interface CodeRunResult {
	kind: "code";
	caseId: string;
	provider: string;
	model: string;
	docsMode: DocsMode;
	fence: boolean;
	pass0: boolean;
	passed: boolean;
	attempts: number;
	error?: string;
	unsupported: boolean;
	/** The reply stopped before the closing fence (output limit). */
	truncated?: boolean;
	/** Final extracted code (raw JSON only), for inspecting failures. */
	code?: string;
	transport?: string;
	toolCalls: number;
	notice?: string;
	latencyMs: number;
	chars: number;
}

export interface KnowledgeRunResult {
	kind: "knowledge";
	caseId: string;
	provider: string;
	model: string;
	docsMode: DocsMode;
	correct: boolean;
	missing: string[];
	hallucinations: string[];
	transport?: string;
	toolCalls: number;
	notice?: string;
	latencyMs: number;
	chars: number;
	excerpt: string;
}

export const REQUEST_TIMEOUT_MS = 180_000;

let seq = 0;
export function message(
	role: ChatMessage["role"],
	text: string,
	metadata?: unknown,
): ChatMessage {
	return { id: `e${++seq}`, role, parts: [{ type: "text", text }], metadata };
}

/** POST /api/chat and reassemble the UI message stream. Never throws. */
export async function chat(
	baseUrl: string,
	body: {
		messages: ChatMessage[];
		provider: string;
		model: string;
		docsMode: DocsMode;
		filename: string;
		source: string;
	},
	fetchImpl: typeof fetch = fetch,
): Promise<ChatResult> {
	const started = performance.now();
	const result: ChatResult = {
		text: "",
		toolCalls: [],
		notices: [],
		latencyMs: 0,
	};
	try {
		const response = await fetchImpl(`${baseUrl}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok || !response.body) {
			const raw = await response.text();
			let detail = raw;
			try {
				const parsed = JSON.parse(raw) as { error?: string };
				if (typeof parsed.error === "string") detail = parsed.error;
			} catch {
				// not JSON
			}
			result.error = `HTTP ${response.status}: ${detail.slice(0, 300)}`;
			return result;
		}
		const texts = new Map<string, string>();
		const order: string[] = [];
		for await (const chunk of sseEvents(response.body)) {
			switch (chunk.type) {
				case "text-delta": {
					const id = String(chunk.id ?? "");
					if (!texts.has(id)) order.push(id);
					texts.set(id, (texts.get(id) ?? "") + String(chunk.delta ?? ""));
					break;
				}
				case "error":
					result.error = String(chunk.errorText ?? "stream error");
					break;
				case "finish":
					result.finishReason =
						typeof chunk.finishReason === "string"
							? chunk.finishReason
							: undefined;
					break;
				case "tool-input-available":
					result.toolCalls.push(String(chunk.toolName ?? "tool"));
					break;
				case "data-notice": {
					const data = chunk.data as { message?: string } | undefined;
					result.notices.push(data?.message ?? "notice");
					break;
				}
				default:
					break;
			}
		}
		result.text = order.map((id) => texts.get(id) ?? "").join("");
	} catch (error) {
		result.error =
			error instanceof Error
				? `${error.name}: ${error.message}`
				: String(error);
	} finally {
		result.latencyMs = Math.round(performance.now() - started);
	}
	return result;
}

async function* sseEvents(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let index = buffer.indexOf("\n\n");
		while (index !== -1) {
			const block = buffer.slice(0, index);
			buffer = buffer.slice(index + 2);
			for (const line of block.split("\n")) {
				if (!line.startsWith("data:")) continue;
				const payload = line.slice(5).trim();
				if (payload === "[DONE]") return;
				try {
					yield JSON.parse(payload) as Record<string, unknown>;
				} catch {
					// ignore malformed line
				}
			}
			index = buffer.indexOf("\n\n");
		}
	}
}

/** Same checks as `validateProposal` in apply.ts, with the native compiler. */
export function validateCode(
	code: string,
	filename = "index.astro",
): ProposalValidation {
	if (code.trim() === "") return { ok: false, error: "The proposal is empty." };
	try {
		const result = compileAstroSync(code, { filename });
		const parsed = parseAstroSync(code);
		const ast = {
			ast: JSON.parse(parsed.ast),
			diagnostics: parsed.diagnostics,
		};
		const errors = result.diagnostics.filter((d) => d.severity === "error");
		if (errors.length > 0) {
			return { ok: false, error: formatCompilerErrors(code, errors) };
		}
		const unsupported = validatePreview(result, ast);
		if (unsupported) return { ok: false, error: unsupported };
		return {
			ok: true,
			warnings: result.diagnostics
				.filter((d) => d.severity === "warning")
				.map((d) => d.text),
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export interface Discovery {
	targets: ChatTarget[];
	skipped: string[];
	localModels: Record<string, string[]>;
}

interface ProviderInfoLite {
	id: string;
	kind: "local" | "gateway";
	configured: boolean;
}

/**
 * Resolve the requested targets against what the server can actually serve.
 * Local providers contribute every model currently loaded on the server.
 */
export async function discoverTargets(
	baseUrl: string,
	requested: ChatTarget[],
	fetchImpl: typeof fetch = fetch,
): Promise<Discovery> {
	const list = (await (await fetchImpl(`${baseUrl}/api/models`)).json()) as {
		providers?: ProviderInfoLite[];
	};
	const providers = list.providers ?? [];
	const skipped: string[] = [];
	const targets: ChatTarget[] = [];
	const localModels: Record<string, string[]> = {};

	for (const target of requested) {
		const info = providers.find((p) => p.id === target.provider);
		if (!info?.configured) {
			skipped.push(
				`${target.provider}:${target.model} (provider not configured)`,
			);
			continue;
		}
		targets.push(target);
	}
	for (const info of providers.filter((p) => p.kind === "local")) {
		try {
			const payload = (await (
				await fetchImpl(
					`${baseUrl}/api/models?provider=${encodeURIComponent(info.id)}`,
				)
			).json()) as { ok: boolean; models?: string[]; error?: string };
			if (payload.ok && payload.models && payload.models.length > 0) {
				localModels[info.id] = payload.models;
				for (const model of payload.models)
					targets.push({ provider: info.id, model });
			} else {
				skipped.push(`${info.id} (${payload.error ?? "no models loaded"})`);
			}
		} catch (error) {
			skipped.push(
				`${info.id} (${error instanceof Error ? error.message : String(error)})`,
			);
		}
	}
	return { targets, skipped, localModels };
}

const UNSUPPORTED = /not supported in Preview/i;

/** One code case with the same fix-loop rules as the chat panel (max `maxFix` retries). */
export async function runCodeCase(
	baseUrl: string,
	target: ChatTarget,
	docsMode: DocsMode,
	testCase: CodeCase,
	maxFix = 2,
	fetchImpl: typeof fetch = fetch,
): Promise<CodeRunResult> {
	const messages: ChatMessage[] = [message("user", testCase.prompt)];
	const result: CodeRunResult = {
		kind: "code",
		caseId: testCase.id,
		provider: target.provider,
		model: target.model,
		docsMode,
		fence: false,
		pass0: false,
		passed: false,
		attempts: 0,
		unsupported: false,
		toolCalls: 0,
		latencyMs: 0,
		chars: 0,
	};
	for (let round = 0; ; round++) {
		const reply = await chat(
			baseUrl,
			{
				messages,
				...target,
				docsMode,
				filename: "index.astro",
				source: testCase.source,
			},
			fetchImpl,
		);
		result.latencyMs += reply.latencyMs;
		result.chars += reply.text.length;
		result.toolCalls += reply.toolCalls.length;
		if (reply.notices[0]) result.notice = reply.notices[0];
		if (reply.error) {
			result.transport = reply.error;
			break;
		}
		messages.push(message("assistant", reply.text));
		const extracted = extractAstroCode(reply.text);
		if (!extracted) {
			result.error = "No ```astro code block in the reply.";
			break; // prose reply: the panel does not auto-fix this either
		}
		result.fence = true;
		result.code = extracted.code.slice(0, 4000);
		if (!extracted.complete) {
			// Same rule as the panel: a cut-off reply is not auto-fixed.
			result.error = "Reply ended before the code block was closed.";
			result.truncated = true;
			break;
		}
		const validation = validateCode(extracted.code);
		if (validation.ok) {
			if (round === 0) result.pass0 = true;
			result.passed = true;
			result.error = undefined;
			break;
		}
		result.error = validation.error;
		result.unsupported = UNSUPPORTED.test(validation.error);
		if (round >= maxFix) break;
		result.attempts = round + 1;
		messages.push(
			message("user", buildFixPrompt(validation.error, round + 1, maxFix), {
				kind: "fix",
				attempt: round + 1,
				max: maxFix,
			}),
		);
	}
	return result;
}

export async function runKnowledgeCase(
	baseUrl: string,
	target: ChatTarget,
	docsMode: DocsMode,
	testCase: KnowledgeCase,
	fetchImpl: typeof fetch = fetch,
): Promise<KnowledgeRunResult> {
	const reply = await chat(
		baseUrl,
		{
			messages: [message("user", testCase.prompt)],
			...target,
			docsMode,
			filename: "index.astro",
			source: "",
		},
		fetchImpl,
	);
	const score = scoreKnowledge(reply.text, testCase);
	return {
		kind: "knowledge",
		caseId: testCase.id,
		provider: target.provider,
		model: target.model,
		docsMode,
		correct: !reply.error && score.correct,
		missing: score.missing,
		hallucinations: score.hallucinations,
		transport: reply.error,
		toolCalls: reply.toolCalls.length,
		notice: reply.notices[0],
		latencyMs: reply.latencyMs,
		chars: reply.text.length,
		excerpt: reply.text.replace(/\s+/g, " ").slice(0, 240),
	};
}
