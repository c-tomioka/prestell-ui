# @prestell/playground

Prestell UI 本体（Astro 7 + Svelte 5 + Cloudflare Workers ランタイム）。

```bash
pnpm dev        # astro dev（workerd 上で動作、/api/* も同じプロセス）
pnpm dev:stop   # daemon 化された dev サーバーを停止
pnpm check      # tsc --noEmit
pnpm test       # vitest
```

- 環境変数は `.dev.vars.example` を `.dev.vars` にコピーして設定する（git 管理外）。
- プレビューは `POST /api/render` → Cloudflare Worker Loader 上で Astro Container API がレンダリングする（上流 withastro/astro-playground と同方式）。
