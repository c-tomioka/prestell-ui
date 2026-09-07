# Security policy

## Supported versions

Only the `main` branch is supported. There are no tagged releases yet.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private vulnerability reporting for this
repository: <https://github.com/c-tomioka/prestell-ui/security/advisories/new>. You should get a first response
within a week.

Include what you found, how to reproduce it, and which part of the app is affected (browser UI, the `/api/*`
Workers routes, the preview renderer, or the evaluation harness).

## What to keep in mind when using Prestell UI

- Generated code is compiled and rendered **in your own browser** (a same-origin Web Worker) in the default
  `browser` preview mode. Do not paste or generate code you do not trust; isolation in a separate origin is
  planned for the public static-host version (`docs/PREVIEW_RENDERING.md`).
- API keys and tokens belong only in `apps/playground/.dev.vars` (git-ignored). Never paste them into issues,
  discussions, or pull requests. `astro build` copies `.dev.vars` into `apps/playground/dist/server/`, so do not
  share the `dist/` folder either.
- Local LLM servers (Ollama, LM Studio) are reached from the Workers runtime on your machine, not from the
  browser, so no CORS relaxation is needed on them.
