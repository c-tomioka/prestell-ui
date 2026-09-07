# Contributing to Prestell UI

Thanks for your interest! Issues and pull requests are welcome in **English or Japanese**.

## What to contribute

Good fits for this repository (see `docs/ROADMAP.md`, Phases 1–3):

- Bug fixes and UX improvements to the editor, preview, and AI chat
- New or better LLM provider support (local servers, AI Gateway models)
- Evaluation cases and prompt templates (`apps/playground/scripts/eval/`, `src/lib/ai/templates.ts`)
- Documentation (the `docs/` folder is currently Japanese; English translations are welcome)

Please **open an issue first** for anything that changes the architecture, such as how providers are switched
through AI Gateway or how the Astro Docs MCP server is reached. The static-host phase (Phase 4) is in progress, so
please coordinate through an issue before working on it. The SaaS and billing phases (Phases 7–8) are out of scope
for pull requests; SaaS-only logic lives in a separate private repository (see `docs/OSS_SCOPE.md`).

## Setup

Requirements: Node.js 24+ and pnpm 11 (selected automatically through the `packageManager` field).

```bash
pnpm install
cp apps/playground/.dev.vars.example apps/playground/.dev.vars   # local LLMs need no edits
pnpm dev          # http://localhost:4321 (daemonised; stop with pnpm dev:stop)
```

`docs/DEVELOPMENT.md` (Japanese) has the full setup, tuning constants, and manual test checklist.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm dev:server` | Dev server with browser-side / server-side preview rendering |
| `pnpm check` | `tsc --noEmit` for the playground and `lang-astro` |
| `pnpm test` | Vitest unit tests (no dev server needed) |
| `pnpm lint` / `pnpm lint:fix` | Biome (tabs, double quotes) |
| `pnpm eval` | LLM quality / hallucination harness. Needs a running dev server and may spend API credits (`docs/EVALUATION.md`) |

Run `pnpm lint && pnpm check && pnpm test` before opening a pull request; CI runs the same three, plus a
[gitleaks](https://github.com/gitleaks/gitleaks) secret scan of the commits in the push or pull request. To catch secrets before they are
committed, opt in to the local hook once: `brew install gitleaks && git config core.hooksPath .githooks`.

## Conventions

- TypeScript everywhere, including the Workers routes under `apps/playground/src/pages/api` and `src/server`.
- Files derived from [withastro/astro-playground](https://github.com/withastro/astro-playground) keep their
  `Derived from withastro/astro-playground (MIT)` header. Do not remove it, and add it to new files that copy upstream code.
- Anything the model generates must pass `validateProposal` (`apps/playground/src/lib/ai/apply.ts`) before it reaches the editor.
- `apps/` and `packages/` must not import from `saas/` or depend on SaaS-only services.
- Secrets live only in `apps/playground/.dev.vars` (git-ignored). If you add an environment variable, update
  `.dev.vars.example`, the README provider table, and the table in `docs/OSS_SCOPE.md`.
- Keep the preview single-file: no `import`, framework components, `client:*`, or external scripts (they are rejected by `validatePreview`).

## Pull requests

1. Branch from `main`. Keep pull requests focused; split unrelated changes.
2. Fill in the pull request template (what changed, how you tested it).
3. Commit messages: English is preferred, Japanese is fine. Say what changed and why.
4. AI-assisted changes (Claude Code, Copilot, …) are welcome as long as a human reviewed them and the checks pass.
   `.claude/CLAUDE.md` is the project guide used with Claude Code; mention AI assistance in the pull request if it was substantial.

## License

By contributing you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE.txt)
(Section 5, inbound = outbound). There is no CLA or DCO. Portions derived from the Astro Playground stay under
the MIT License as described in `THIRD_PARTY_NOTICES.md`.

## Code of conduct and security

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Please report vulnerabilities privately as
described in [SECURITY.md](./SECURITY.md), not in public issues.
