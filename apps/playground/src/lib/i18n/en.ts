// English UI strings: the source of truth. Every key here must exist in
// `ja.ts` (enforced by its type). `{name}` marks a value filled in by `t()`.
export const en = {
	// --- locale switch (header) ---
	"locale.switchTo": "Switch to Japanese",
	"locale.switchText": "日本語",

	// --- toolbar ---
	"toolbar.project": "project",
	"toolbar.sourcemap": "sourcemap",
	"toolbar.compact": "compact",
	"toolbar.scopedStyle": "scoped style",
	"toolbar.showChat": "Show AI chat",
	"toolbar.hideChat": "Hide AI chat",
	"toolbar.switchToLight": "Switch to light mode",
	"toolbar.switchToDark": "Switch to dark mode",
	"toolbar.save": "Save component to disk",
	"toolbar.saved": "Saved!",
	"toolbar.downloaded": "Downloaded",
	"toolbar.saveFailed": "Save failed",
	"toolbar.share": "Copy shareable link",
	"toolbar.copied": "Copied!",
	"toolbar.copyFailed": "Copy failed",

	// --- project menu ---
	"project.new": "New project",
	"project.rename": "Rename project",
	"project.delete": "Delete project",
	"project.namePrompt": "Project name",
	"project.deleteConfirm": "Delete project “{name}” and its chat history?",

	// --- editor pane ---
	"editor.filename": "Component filename",
	"editor.starting": "Starting compiler…",
	"editor.compiling": "Compiling…",
	"editor.compilerError": "Compiler error",
	"editor.compiledIn": "Compiled in {ms} ms",
	"editor.resize": "Resize editor and output panes",

	// --- output tabs ---
	"tabs.preview": "Preview",
	"tabs.js": "JS",
	"tabs.css": "CSS",
	"tabs.scripts": "Scripts",
	"tabs.metadata": "Metadata",
	"tabs.diagnostics": "Diagnostics",
	"tabs.ast": "AST",
	"tabs.sourcemap": "Source map",
	"output.tablist": "Compiler output",
	"output.compiled": "Compiled output (read-only)",
	"output.badge.server": "server",
	"output.badge.sandboxed": "browser · sandboxed",
	"output.badge.unisolated": "browser · not isolated",
	"output.renderer.server":
		"Rendered on the server via /api/render (Cloudflare Worker Loader)",
	"output.renderer.sandboxed":
		"Rendered in a Web Worker inside a sandbox frame on a separate origin (no server call, no access to this app)",
	"output.renderer.unisolated":
		"Rendered in a Web Worker of this origin: no separate preview origin is configured (PUBLIC_PREVIEW_ORIGIN), so generated code is not isolated from this app",
	"output.autoTitle": "Render the preview automatically after each edit",
	"output.auto": "Auto",
	"output.renderNow": "Render preview now",
	"output.renderNowStale": "Render preview now (changes not rendered)",
	"output.stale": "Changes not rendered",
	"output.staleBanner": "Changes not rendered — press ↻ or enable Auto.",
	"output.frameTitle": "Rendered Astro component",
	"output.rendering": "Rendering preview…",
	"output.selectPreview": "Select Preview to render.",
	"output.scopeHash": "Scope hash",
	"output.containsHead": "Contains <head>",
	"output.propagation": "Propagation",
	"output.hydrated": "Hydrated components",
	"output.clientOnly": "Client-only components",
	"output.serverComponents": "Server components",
	"output.styleErrors": "Style errors",
	"output.nothingCompiled": "Nothing compiled yet.",
	"output.noDiagnostics": "No diagnostics.",

	// --- chat panel ---
	"chat.title": "AI chat",
	"chat.clear": "Clear chat history",
	"chat.close": "Close chat panel",
	"chat.autoApply": "Auto-apply valid proposals",
	"chat.autoFix": "Auto-fix errors, up to",
	"chat.autoFixAria": "Maximum auto-fix attempts",
	"chat.tries": "tries",
	"chat.fallback": "Fallback",
	"chat.fallbackAria": "Fallback provider offered after a failed request",
	"chat.none": "none",
	"chat.docs": "Astro docs",
	"chat.docsOff": "off",
	"chat.docsInject": "inject (search first)",
	"chat.docsTools": "tools (tool calling)",
	"chat.retrying": "Retrying…",
	"chat.retry": "Retry",
	"chat.retryWith": "Retry with {provider}",
	"chat.dismiss": "Dismiss",
	"chat.message": "Message",
	"chat.placeholder":
		"Describe the component or the change you want… (⌘/Ctrl+Enter to send)",
	"chat.stop": "Stop generating",
	"chat.send": "Send (⌘/Ctrl+Enter)",
	"chat.providersFailed": "Could not load providers: {error}",
	"chat.truncated":
		"The reply ended before the code block was closed (output limit reached). Ask for a smaller component or pick a model with a larger output limit.",
	"chat.empty":
		"Describe the component you want — e.g. “A pricing section with three tiers and a highlighted middle plan” — or pick a template next to the Send button. The reply is validated with the Astro compiler before it replaces the editor.",
	"chat.you": "You",
	"chat.assistant": "Assistant",
	"chat.fixRequest": "🔧 Auto-fix request {attempt}/{max}",
	"chat.thinking": "Thinking…",

	// --- code proposal card ---
	"proposal.title": "Component proposal",
	"proposal.lines": "{count} lines",
	"proposal.generating": "Generating…",
	"proposal.validating": "Validating…",
	"proposal.ready": "Ready to apply",
	"proposal.applied": "Applied to editor",
	"proposal.cannotRender": "Cannot render",
	"proposal.fixing": "Cannot render · auto-fixing {attempt}/{max}…",
	"proposal.retried": "Cannot render · retried ({attempt}/{max})",
	"proposal.gaveUp": "Cannot render · auto-fix gave up ({attempt}/{max})",
	"proposal.expand": "Expand",
	"proposal.collapse": "Collapse",
	"proposal.apply": "Apply",
	"proposal.applyAgain": "Apply again",
	"proposal.applyAnyway": "Apply anyway",

	// --- provider settings ---
	"provider.connection": "Connection",
	"provider.server": "Server (/api/chat)",
	"provider.direct": "Direct (browser → provider, BYOK)",
	"provider.hint.server":
		"Requests go through this app's /api/chat; provider keys stay in .dev.vars on the server.",
	"provider.hint.direct":
		"Requests go from the browser straight to the provider (bring your own key). Works without the API server.",
	"provider.provider": "Provider",
	"provider.notConfigured": "not configured",
	"provider.serverOnly": "server only",
	"provider.apiKey": "API key",
	"provider.keyPlaceholder": "Paste your {provider} API key",
	"provider.forgetKeys": "Forget all keys in this tab",
	"provider.keyNote":
		"Billed to your own account. Kept in this tab only; never stored elsewhere.",
	"provider.keySaved": "Key saved for this tab (…{tail}).",
	"provider.keySavedShort": "Key saved for this tab.",
	"provider.serverUrl": "Server URL",
	"provider.model": "Model",
	"provider.loadingModels": "Loading models…",
	"provider.modelPlaceholder": "model id",
	"provider.reloadModels": "Reload model list",

	// --- templates ---
	"template.insert": "Insert a prompt template",
	"template.placeholder": "Template…",
	"template.category.component": "Component",
	"template.category.layout": "Layout",
	"template.category.style": "Style",
	"template.card": "Card",
	"template.hero": "Hero section",
	"template.pricing": "Pricing section",
	"template.navbar": "Navigation bar",
	"template.contact-form": "Contact form",
	"template.testimonials": "Testimonials",
	"template.feature-grid": "Feature grid",
	"template.landing": "Landing page",
	"template.two-column": "Two-column layout",
	"template.dashboard": "Dashboard grid",
	"template.blog-post": "Blog post",
	"template.responsive": "Make it responsive",
	"template.a11y": "Improve accessibility",
	"template.dark-mode": "Add dark mode",
	"template.typography": "Polish spacing & typography",
	"template.states": "Add hover / focus states",
	"template.simplify-css": "Simplify the CSS",
	"template.css-vars": "Use CSS custom properties",

	// --- direct-mode help ---
	"help.title": "How direct mode works",
	"help.cloud.route":
		"Requests go from this browser straight to {provider}; this app has no server in between and never sees your key.",
	"help.cloud.billing":
		"Usage, rate limits, and billing are tied to your own {provider} account. Keep an eye on your usage there.",
	"help.cloud.storage":
		"The key stays in this tab (sessionStorage): it is gone when the tab closes and is never written to localStorage, the URL, or saved projects. “Forget all keys” removes it right away.",
	"help.cloud.docs":
		"Astro docs searches go through a small relay that only sees the search text, never your key or your code.",
	"help.local.route":
		"Requests go from this browser straight to {provider} on your machine; this app has no server in between.",
	"help.local.billing":
		"Nothing is billed: the model runs locally. Astro docs searches go through a small relay that only sees the search text.",
	"help.local.setup": "{start}. {cors}",
	"help.unsupported":
		"{provider} cannot be called from the browser (Cloudflare AI Gateway sends no CORS headers). Pick another provider, or use Connection: Server.",
	"help.getKey.anthropic": "Get an Anthropic API key",
	"help.getKey.openai": "Get an OpenAI API key",
	"help.getKey.google": "Get a Google AI Studio API key",
	"help.emptyNote.cloud":
		"Direct mode: your prompt goes straight from this browser to {provider} with your own API key.",
	"help.emptyNote.local":
		"Direct mode: your prompt goes straight from this browser to {provider}.",

	// --- notices and errors (messages.ts) ---
	"start.ollama": "Run `ollama serve`",
	"start.lmstudio":
		"In LM Studio, open the Developer tab and press Start Server",
	"cors.ollama.localhost":
		"Localhost origins are allowed by default; if you changed `OLLAMA_ORIGINS`, include this origin.",
	"cors.ollama.origin":
		"Start it with `OLLAMA_ORIGINS={origin} ollama serve` so it accepts requests from this origin.",
	"cors.lmstudio":
		"Start the server with CORS enabled: `lms server start --cors`, or turn on “Enable CORS” in the Developer tab.",
	"error.localUnreachable":
		"Cannot reach {provider} at {base}. {start}, then retry.",
	"error.timeout":
		"The model did not respond in time ({detail}). Retry, or pick another model or provider.",
	"error.directUnreachable":
		"Cannot reach {provider} at {base} from the browser. {start}. {cors}",
	"error.directNetwork":
		"Could not reach {provider} from the browser ({detail}). Check your network connection, then retry.",
	"error.directUnsupported":
		"{provider} cannot be called from the browser (Cloudflare AI Gateway sends no CORS headers). Switch Connection to Server to use it.",
	"error.keyMissing":
		"No API key for {provider}. Paste your key in the API key field above; it stays in this tab and is sent only to {provider}.",
	"error.keyRejected":
		"{provider} rejected the API key (HTTP {status}). Check the key, then retry.",
	"error.rateLimited":
		"{provider} is rate limiting this key (HTTP 429{detail}). Wait a moment, then retry.",
	"error.providerError": "{provider} returned HTTP {status}{detail}.",
	"hint.ollamaDown":
		"Ollama is not running or has no models. Run `ollama serve` and pull a model with `ollama pull <model>`.",
	"hint.lmstudioDown":
		"The LM Studio server is not running. In LM Studio, open the Developer tab, press Start Server, and load a model.",
	"hint.noLocalModels":
		"No models found on the local server. Pull or load a model, then reload.",
	"hint.directLocal": "Called from the browser at {base}. {cors}",
	"hint.directKey":
		"Requests go from your browser straight to {provider} with your own API key, so usage and rate limits are billed to your account. The key is kept in this tab only (sessionStorage), never in localStorage or the URL.",
	"hint.keyMissing": "Enter your {provider} API key to use direct mode.",
	"hint.directUnsupported":
		"{provider} is only available with Connection: Server (Cloudflare AI Gateway has no CORS headers).",
} as const;

export type MessageKey = keyof typeof en;
