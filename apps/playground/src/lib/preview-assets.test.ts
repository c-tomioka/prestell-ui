// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableCSSFileLoading": true, "disableJavaScriptFileLoading": true } }
import { describe, expect, it } from "vitest";
import {
	assetDataUrls,
	assetPathOf,
	isImagePath,
	mimeTypeFor,
	publicUrlPath,
	rewriteCssAssets,
	rewriteDocumentAssets,
	toDataUrl,
} from "./preview-assets";

describe("asset paths", () => {
	it("maps public files to their served path and mime type", () => {
		expect(publicUrlPath("public/images/logo.png")).toBe("/images/logo.png");
		expect(publicUrlPath("src/pages/index.astro")).toBeNull();
		expect(mimeTypeFor("public/a.webp")).toBe("image/webp");
		expect(mimeTypeFor("public/x.unknown")).toBe("application/octet-stream");
		expect(isImagePath("public/a.svg")).toBe(true);
		expect(isImagePath("public/a.css")).toBe(false);
	});

	it("normalises references and ignores external ones", () => {
		expect(assetPathOf("/images/a.png?v=1#x")).toBe("/images/a.png");
		expect(assetPathOf("images/a.png")).toBe("/images/a.png");
		expect(assetPathOf("./images/a%20b.png")).toBe("/images/a b.png");
		expect(assetPathOf("https://example.com/a.png")).toBeNull();
		expect(assetPathOf("//cdn/a.png")).toBeNull();
		expect(assetPathOf("data:image/png;base64,AA==")).toBeNull();
		expect(assetPathOf("#top")).toBeNull();
	});
});

describe("data urls", () => {
	it("encodes text and blobs and caches per content", async () => {
		expect(await toDataUrl("public/a.txt", "hi")).toBe(
			"data:text/plain;base64,aGk=",
		);
		const blob = new Blob([new Uint8Array([137, 80, 78, 71])]);
		const cache = new Map();
		const files = {
			"public/img/a.png": blob,
			"public/b.svg": "<svg/>",
			"src/x.astro": "",
		};
		const urls = await assetDataUrls(files, cache);
		expect(Object.keys(urls).sort()).toEqual(["/b.svg", "/img/a.png"]);
		expect(urls["/img/a.png"]).toBe("data:image/png;base64,iVBORw==");
		expect(cache.size).toBe(2);
		const again = await assetDataUrls({ "public/b.svg": "<svg/>" }, cache);
		expect(again["/b.svg"]).toBe(urls["/b.svg"]);
		expect(cache.size).toBe(1); // the removed png was pruned
	});
});

describe("rewriting", () => {
	const assets = {
		"/images/a.png": "data:image/png;base64,AAAA",
		"/images/b.png": "data:image/png;base64,BBBB",
		"/site.css": `data:text/css;base64,${btoa("body { background: url(/images/b.png) }")}`,
	};

	it("rewrites css url() references", () => {
		expect(
			rewriteCssAssets(
				`.a { background: url("/images/a.png"); } .b { background: url(https://x/y.png) }`,
				assets,
			),
		).toBe(
			`.a { background: url("data:image/png;base64,AAAA"); } .b { background: url(https://x/y.png) }`,
		);
	});

	it("rewrites document attributes, srcset, inline styles and stylesheet links", () => {
		const document = new DOMParser().parseFromString(
			`<html><head><link rel="icon" href="/images/a.png"><link rel="stylesheet" href="/site.css"></head>
			<body><img src="/images/a.png" srcset="/images/a.png 1x, /images/b.png 2x" alt="">
			<img src="https://example.com/x.png"><div style="background:url(images/b.png)"></div>
			<style>.x{background:url('/images/a.png')}</style></body></html>`,
			"text/html",
		);
		rewriteDocumentAssets(document, assets);
		const imgs = document.querySelectorAll("img");
		expect(imgs[0].getAttribute("src")).toBe("data:image/png;base64,AAAA");
		expect(imgs[0].getAttribute("srcset")).toBe(
			"data:image/png;base64,AAAA 1x, data:image/png;base64,BBBB 2x",
		);
		expect(imgs[1].getAttribute("src")).toBe("https://example.com/x.png");
		expect(
			document.querySelector("link[rel='icon']")?.getAttribute("href"),
		).toBe("data:image/png;base64,AAAA");
		expect(document.querySelector("div")?.getAttribute("style")).toContain(
			"BBBB",
		);
		expect(document.querySelector("body style")?.textContent).toContain("AAAA");
		expect(document.querySelector("link[rel='stylesheet']")).toBeNull();
		expect(document.querySelector("head style")?.textContent).toContain(
			"url(data:image/png;base64,BBBB)",
		);
	});
});
