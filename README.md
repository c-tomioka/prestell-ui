# Prestell UI

[![CI](https://github.com/c-tomioka/prestell-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/c-tomioka/prestell-ui/actions/workflows/ci.yml) [![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE.txt)

> An AI chat builder for [Astro](https://astro.build/): describe a component, get `.astro` code that is validated by the real Astro compiler, and preview it instantly in the browser.

[日本語版 README はこちら](./README.ja.md)

Prestell UI is a "v0 / bolt.new for Astro" built on top of the official [Astro Playground](https://github.com/withastro/astro-playground). It runs on the Cloudflare Workers runtime locally (`astro dev` = workerd), talks to local or cloud LLMs, and uses the [Astro Docs MCP Server](https://docs.astro.build/en/reference/developer-tools/#astro-docs-mcp-server) so generated code follows current Astro APIs.

![Prestell UI: editor, live preview, and AI chat with an applied proposal](./docs/assets/screenshot.png)

## Features

- **Chat to code** – generate and edit single-file Astro components. Every proposal is compiled with `@astrojs/compiler` (WASM) and rejected if it cannot render, so broken code never reaches the editor.
- **Live preview in the browser** – rendering runs in a Web Worker with `astro/container`; no server round-trip. Server-side rendering via Cloudflare Worker Loader is available as an option.
- **Local or cloud LLMs** – Ollama and LM Studio (no API key), or Anthropic Claude, OpenAI, Google Gemini, and Workers AI through Cloudflare AI Gateway (BYOK).
- **Astro knowledge via MCP** – `inject` (default) searches the Astro docs before each request; `tools` lets the model search on its own. In our evaluation `inject` brought hallucinated Astro APIs to zero for every model tested ([docs/EVALUATION.md](./docs/EVALUATION.md)).
- **Auto-fix loop** – compiler errors, with the offending source line, are sent back to the model automatically (up to a configurable number of attempts).
- **Projects and templates** – projects and chat history are stored in IndexedDB, 18 built-in prompt templates, and one-click save to a `.astro` file (File System Access API or download).

## Status

**Public since 2026-09-07 (`v0.1.0`)**; Phase 3 of the [roadmap](./docs/ROADMAP.md) is complete and the next phase is a static-host (BYOK) version. It is used daily by the maintainer for single-file components. The preview intentionally supports one self-contained `.astro` component: no `import`, framework components, `client:*` directives, or external scripts yet. A static-host (BYOK) version and a hosted SaaS are later phases; SaaS-only code lives outside this repository ([docs/OSS_SCOPE.md](./docs/OSS_SCOPE.md)).

## Requirements

- Node.js 24 or newer and pnpm 11 (picked automatically through the `packageManager` field)
- Optional: [Ollama](https://ollama.com/) or [LM Studio](https://lmstudio.ai/) for local models
- Optional: a Cloudflare account with [AI Gateway](https://developers.cloudflare.com/ai-gateway/) for cloud models and Workers AI

## Quick start

```bash
git clone https://github.com/c-tomioka/prestell-ui.git
cd prestell-ui
pnpm install
cp apps/playground/.dev.vars.example apps/playground/.dev.vars   # no edits needed for local LLMs
pnpm dev                                                           # http://localhost:4321
```

The dev server runs as a daemon; stop it with `pnpm dev:stop`. `/api/*` runs in the same workerd process, so there is no separate `wrangler dev`.

To try it without any API key:

```bash
ollama pull qwen2.5-coder:7b
ollama serve
```

Then pick **Ollama (local)** in the AI chat panel, choose the model, and send a prompt such as:

```text
Make a pricing section with three tiers and a highlighted middle plan. Use a blue accent.
```

## LLM providers

All configuration lives in `apps/playground/.dev.vars` (git-ignored; template in `.dev.vars.example`).

| Provider | Needs | Environment variables |
|---|---|---|
| Ollama | `ollama serve` on your machine | `OLLAMA_BASE_URL` (default `http://localhost:11434/v1`) |
| LM Studio | the local server started (GUI or `lms server start`) | `LMSTUDIO_BASE_URL` (default `http://localhost:1234/v1`) |
| Workers AI | Cloudflare AI Gateway | `CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN`, `CF_AI_GATEWAY_ID` |
| Anthropic / OpenAI / Google | AI Gateway plus a provider key: either stored in the Gateway (BYOK / Unified Billing) or set locally and passed through | the three above, plus `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` |
| Astro Docs MCP | nothing | `ASTRO_DOCS_MCP_URL` (default `https://mcp.docs.astro.build/mcp`) |

Local servers are reached from the Workers runtime, not from the browser, so they need no CORS changes. Never commit `.dev.vars`; see [SECURITY.md](./SECURITY.md).

## Preview rendering

The default renders in a browser Web Worker. To use the server-side renderer (Worker Loader, same as the upstream playground):

```bash
pnpm dev:server
```

The current mode is shown as a badge in the output pane. Design notes: [docs/PREVIEW_RENDERING.md](./docs/PREVIEW_RENDERING.md).

## Usage

1. Open http://localhost:4321. The editor is on the left, the preview in the middle, the AI chat on the right (toggle with **AI chat** in the toolbar).
2. Choose a provider and model. **Astro docs** controls the MCP mode (`inject` by default).
3. Describe the component, or pick a prompt template with **Template…**. `⌘/Ctrl+Enter` sends.
4. Valid proposals are applied to the editor automatically and the preview updates. Invalid ones trigger the auto-fix loop; you can also **Apply anyway**.
5. Refine with follow-up prompts, then **Save** the `.astro` file.

## Documentation

The design documents under `docs/` are written in Japanese.

- [OVERVIEW.md](./docs/OVERVIEW.md) – product goals and requirements
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) – system design and technology choices
- [ROADMAP.md](./docs/ROADMAP.md) – phases and task lists
- [DEVELOPMENT.md](./docs/DEVELOPMENT.md) – setup details, tuning constants, manual test checklist
- [LOCAL_LLM.md](./docs/LOCAL_LLM.md) – Ollama / LM Studio integration and a step-by-step walkthrough
- [PREVIEW_RENDERING.md](./docs/PREVIEW_RENDERING.md) – browser vs. server preview renderers
- [EVALUATION.md](./docs/EVALUATION.md) – LLM quality / hallucination harness (`pnpm eval`) and findings
- [OSS_SCOPE.md](./docs/OSS_SCOPE.md) – what is open source, the SaaS boundary, and the secrets audit

## Contributing

Issues and pull requests are welcome in English or Japanese. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first. This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md); report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

## License

[Apache License 2.0](./LICENSE.txt). Portions are derived from the [Astro Playground](https://github.com/withastro/astro-playground) (MIT License, Copyright (c) 2022 Astro); those files carry a header comment and the full MIT text is in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Acknowledgements

- [Astro](https://astro.build/) and the [Astro Playground](https://play.astro.build/)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) and Workers
- [Vercel AI SDK](https://ai-sdk.dev/)
- [Ollama](https://ollama.com/) and [LM Studio](https://lmstudio.ai/)
