# Third-party notices

This repository is licensed under the Apache License, Version 2.0 (see `LICENSE.txt`).
Portions of the code are derived from third-party projects and remain subject to
their original licenses, reproduced below.

## Astro Playground (withastro/astro-playground)

- Source: https://github.com/withastro/astro-playground
- License: MIT
- Derived files are marked with a header comment
  `Derived from withastro/astro-playground (MIT)`. The header is authoritative;
  list them with `git grep -l 'Derived from withastro/astro-playground'`. As of 2026-09-07:
  - `packages/lang-astro/` (`package.json`, `scripts/build-grammar.mjs`, `src/index.ts`, `src/syntax.grammar`, `src/tokens.js`; the package keeps its upstream MIT `LICENSE`)
  - `apps/playground/astro.config.ts`, `src/env.d.ts`, `src/pages/index.astro`, `src/pages/api/render.ts`
  - `apps/playground/src/components/{Playground,Editor,OutputTabs,Toolbar}.svelte`
  - `apps/playground/src/lib/`: `codemirror/index.ts`, `compiler-protocol.ts`, `compiler.ts`, `compiler.worker.ts`,
    `diagnostics.ts`, `options.ts`, `preview-manifest.ts`, `preview-protocol.ts`, `preview-runtime.ts`,
    `preview-worker.ts`, `preview.ts`, `preview.test.ts`, `samples.ts`, `share.ts`, `theme.ts`
- Everything else in this repository (AI chat, providers, MCP, projects, fix loop, evaluation harness, docs)
  is original work licensed under Apache-2.0.

```
MIT License

Copyright (c) 2022 Astro

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
