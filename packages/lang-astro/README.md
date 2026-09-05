# @prestell/codemirror-astro

CodeMirror 6 language support for `.astro` files (Lezer grammar + mixed-language nesting for TypeScript / JSX / CSS).

Derived from [withastro/astro-playground](https://github.com/withastro/astro-playground) (`packages/lang-astro`), MIT License — see `LICENSE` in this directory.

- `pnpm --filter @prestell/codemirror-astro run build:grammar` regenerates `src/parser.js` / `src/parser.terms.js` from `src/syntax.grammar`.
