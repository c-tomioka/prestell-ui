// Resolve references to the project's `public/` files inside the rendered
// preview. Astro serves `public/` at the site root, so `/images/logo.png` in
// the HTML or CSS means `public/images/logo.png` in the project. The preview
// document is a `srcdoc` iframe with an opaque origin that cannot load the
// app's `blob:` URLs, so files are inlined as `data:` URLs instead (cached per
// Blob by the app; see `assetDataUrls`).
import { extensionOf } from "./preview-graph";
import type { ProjectFile } from "./projects/types";

/** `data:` URLs for `public/` files, keyed by the URL path they are served at (`/images/logo.png`). */
export type AssetUrls = Readonly<Record<string, string>>;

const MIME: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".bmp": "image/bmp",
	".css": "text/css",
	".txt": "text/plain",
	".json": "application/json",
	".webmanifest": "application/manifest+json",
	".xml": "application/xml",
	".html": "text/html",
	".js": "text/javascript",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mp3": "audio/mpeg",
};

export function mimeTypeFor(path: string): string {
	return MIME[extensionOf(path)] ?? "application/octet-stream";
}

export function isImagePath(path: string): boolean {
	return mimeTypeFor(path).startsWith("image/");
}

/** `public/images/logo.png` → `/images/logo.png`; null for non-public files. */
export function publicUrlPath(path: string): string | null {
	return path.startsWith("public/") ? `/${path.slice("public/".length)}` : null;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

/** `data:` URL for one project file (text or Blob). */
export async function toDataUrl(
	path: string,
	content: ProjectFile,
): Promise<string> {
	const type = mimeTypeFor(path);
	const bytes =
		typeof content === "string"
			? new TextEncoder().encode(content)
			: new Uint8Array(await content.arrayBuffer());
	return `data:${type};base64,${bytesToBase64(bytes)}`;
}

/**
 * Builds the URL map for every `public/` file, reusing `previous` entries
 * whose content object is unchanged (Blobs are immutable, strings compare by
 * value), so images are encoded once per upload rather than per render.
 */
export async function assetDataUrls(
	files: Readonly<Record<string, ProjectFile>>,
	cache: Map<ProjectFile, string>,
): Promise<AssetUrls> {
	const urls: Record<string, string> = {};
	const live = new Set<ProjectFile>();
	for (const [path, content] of Object.entries(files)) {
		const url = publicUrlPath(path);
		if (!url) continue;
		live.add(content);
		let data = cache.get(content);
		if (!data) {
			data = await toDataUrl(path, content);
			cache.set(content, data);
		}
		urls[url] = data;
	}
	for (const key of cache.keys()) if (!live.has(key)) cache.delete(key);
	return urls;
}

/** Normalise a reference (`/images/a.png?x#y`, `images/a.png`) to a `/`-rooted path, or null when external. */
export function assetPathOf(reference: string): string | null {
	const trimmed = reference.trim();
	if (
		trimmed === "" ||
		/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
		trimmed.startsWith("//") ||
		trimmed.startsWith("#")
	)
		return null;
	const withoutSuffix = trimmed.replace(/[?#].*$/, "");
	let path = withoutSuffix.startsWith("/")
		? withoutSuffix
		: `/${withoutSuffix.replace(/^\.\//, "")}`;
	try {
		path = decodeURIComponent(path);
	} catch {
		// keep as-is
	}
	return path;
}

export function resolveAssetUrl(
	reference: string,
	assets: AssetUrls,
): string | null {
	const path = assetPathOf(reference);
	return path ? (assets[path] ?? null) : null;
}

const CSS_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

/** Rewrite `url(/images/x.png)` inside CSS text. */
export function rewriteCssAssets(css: string, assets: AssetUrls): string {
	return css.replace(CSS_URL, (match, quote: string, reference: string) => {
		const resolved = resolveAssetUrl(reference, assets);
		return resolved ? `url(${quote}${resolved}${quote})` : match;
	});
}

function rewriteSrcset(value: string, assets: AssetUrls): string {
	return value
		.split(",")
		.map((candidate) => {
			const [url, ...descriptor] = candidate.trim().split(/\s+/);
			const resolved = url ? resolveAssetUrl(url, assets) : null;
			return [resolved ?? url, ...descriptor].join(" ");
		})
		.join(", ");
}

const URL_ATTRIBUTES: Array<[selector: string, attribute: string]> = [
	["img", "src"],
	["source", "src"],
	["video", "src"],
	["video", "poster"],
	["audio", "src"],
	["track", "src"],
	["link[rel~='icon']", "href"],
	["link[rel~='apple-touch-icon']", "href"],
	["link[rel~='manifest']", "href"],
	["object", "data"],
];

/**
 * Point every `public/` reference in the document at its `data:` URL:
 * `img`/`source`/`video`/`audio` sources and srcsets, icon links, inline
 * `style` attributes, `<style>` blocks, and `<link rel="stylesheet">` to a
 * project CSS file (inlined as a `<style>`).
 */
export function rewriteDocumentAssets(
	document: Document,
	assets: AssetUrls,
): void {
	if (Object.keys(assets).length === 0) return;
	for (const [selector, attribute] of URL_ATTRIBUTES) {
		for (const element of document.querySelectorAll(selector)) {
			const value = element.getAttribute(attribute);
			if (!value) continue;
			const resolved = resolveAssetUrl(value, assets);
			if (resolved) element.setAttribute(attribute, resolved);
		}
	}
	for (const element of document.querySelectorAll(
		"img[srcset], source[srcset]",
	)) {
		const value = element.getAttribute("srcset");
		if (value) element.setAttribute("srcset", rewriteSrcset(value, assets));
	}
	for (const element of document.querySelectorAll("[style]")) {
		const value = element.getAttribute("style");
		if (value?.includes("url(")) {
			element.setAttribute("style", rewriteCssAssets(value, assets));
		}
	}
	for (const style of document.querySelectorAll("style")) {
		if (style.textContent?.includes("url(")) {
			style.textContent = rewriteCssAssets(style.textContent, assets);
		}
	}
	for (const link of document.querySelectorAll("link[rel~='stylesheet']")) {
		const href = link.getAttribute("href");
		const resolved = href ? resolveAssetUrl(href, assets) : null;
		if (!resolved?.startsWith("data:text/css;base64,")) continue;
		const style = document.createElement("style");
		style.textContent = rewriteCssAssets(
			atob(resolved.slice("data:text/css;base64,".length)),
			assets,
		);
		link.replaceWith(style);
	}
}
