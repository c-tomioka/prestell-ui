// Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root.
import { env } from "cloudflare:workers";
import previewWorkerBundle from "virtual:preview-worker-source";
import type { APIRoute } from "astro";
import {
	ENTRY_MODULE_ID,
	type PreviewModule,
	type PreviewRenderRequest,
} from "../../lib/preview-protocol";

export const prerender = false;

const MAX_REQUEST_BYTES = 1024 * 1024;
const COMPATIBILITY_DATE = "2026-06-22";

function errorResponse(error: string, status: number): Response {
	return Response.json(
		{ ok: false, error },
		{ status, headers: { "Cache-Control": "no-store" } },
	);
}

const MODULE_ID = /^module-\d+\.js$/;

function isPreviewModule(value: unknown): value is PreviewModule {
	if (!value || typeof value !== "object") return false;
	const module = value as Partial<PreviewModule>;
	return (
		typeof module.id === "string" &&
		(module.id === ENTRY_MODULE_ID || MODULE_ID.test(module.id)) &&
		typeof module.moduleId === "string" &&
		typeof module.code === "string" &&
		module.code.length > 0 &&
		typeof module.containsHead === "boolean" &&
		typeof module.propagation === "boolean" &&
		Array.isArray(module.scripts) &&
		module.scripts.every(
			(script) =>
				script?.type === "inline" &&
				(script.code === undefined || typeof script.code === "string"),
		)
	);
}

function isPreviewRequest(value: unknown): value is PreviewRenderRequest {
	if (!value || typeof value !== "object") return false;
	const request = value as Partial<PreviewRenderRequest>;
	if (!Array.isArray(request.modules) || request.modules.length === 0)
		return false;
	if (!request.modules.every(isPreviewModule)) return false;
	const ids = new Set(request.modules.map((module) => module.id));
	return ids.size === request.modules.length && ids.has(ENTRY_MODULE_ID);
}

export const POST: APIRoute = async ({ request }) => {
	if (!request.headers.get("content-type")?.startsWith("application/json")) {
		return errorResponse("Preview requests must use JSON.", 415);
	}

	const contentLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
		return errorResponse("The compiled preview is too large.", 413);
	}

	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
		return errorResponse("The compiled preview is too large.", 413);
	}

	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch {
		return errorResponse("The preview request contains invalid JSON.", 400);
	}
	if (!isPreviewRequest(payload)) {
		return errorResponse("The preview request is invalid.", 400);
	}

	try {
		const worker = env.LOADER.load({
			compatibilityDate: COMPATIBILITY_DATE,
			mainModule: previewWorkerBundle.mainModule,
			modules: {
				...previewWorkerBundle.modules,
				...Object.fromEntries(
					payload.modules.map((module) => [module.id, module.code]),
				),
			},
			globalOutbound: null,
		});
		const response = await worker.getEntrypoint().fetch(
			new Request("https://preview.astro.build/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}),
		);
		const html = await response.text();
		if (!response.ok) {
			return errorResponse(
				html || `The preview returned HTTP ${response.status}.`,
				400,
			);
		}
		return Response.json(
			{ ok: true, html },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : String(error),
			400,
		);
	}
};
