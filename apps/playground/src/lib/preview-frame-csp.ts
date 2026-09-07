// Content-Security-Policy of the preview sandbox frame (`/preview/`).
//
// The frame only runs the render Worker: its own scripts come from its origin
// (`'self'`), the runtime / container bundles and the compiled component are
// Blob modules (`blob:`), and nothing may talk to the network. Workers inherit
// the document's policy, so generated frontmatter code is covered as well.
// Served by `public/_headers` in production and by the dev middleware in
// `astro.config.ts`; `preview-frame-csp.test.ts` keeps the two in sync.
export const PREVIEW_FRAME_CSP = [
	"default-src 'none'",
	"script-src 'self' blob:",
	"worker-src 'self' blob:",
	"connect-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
	"frame-ancestors *",
].join("; ");

/** Dev only: let the Vite client keep its HMR WebSocket (fetch stays blocked). */
export const PREVIEW_FRAME_CSP_DEV = PREVIEW_FRAME_CSP.replace(
	"connect-src 'none'",
	"connect-src ws://localhost:* ws://127.0.0.1:*",
);
