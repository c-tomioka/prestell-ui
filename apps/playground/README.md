# @prestell/playground

Prestell UI 本体（Astro 7 + Svelte 5 + Cloudflare Workers ランタイム）。

```bash
pnpm dev          # astro dev（workerd 上で動作、/api/* も同じプロセス）。プレビューはブラウザ内レンダリング
pnpm dev:server   # プレビューをサーバー側（Worker Loader）でレンダリング
pnpm dev:stop     # daemon 化された dev サーバーを停止
pnpm check      # tsc --noEmit
pnpm test       # vitest
```

- 環境変数は `.dev.vars.example` を `.dev.vars` にコピーして設定する（git 管理外）。
- プレビューは既定でブラウザ内の Web Worker が `astro/container` でレンダリングする（`pnpm dev`）。上流 withastro/astro-playground と同じサーバー側レンダリング（`POST /api/render` → Cloudflare Worker Loader）は `pnpm dev:server` で選べる。詳細は `docs/PREVIEW_RENDERING.md`。
