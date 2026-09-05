# DEVELOPMENT.md

Claude Code での開発時に参照するセットアップ手順・実装優先順・コーディング規約。

## リポジトリ構成

```
apps/playground/        # プロダクト本体（Astro 7 + Svelte 5 + Cloudflare Workers ランタイム）
packages/lang-astro/    # CodeMirror 用 Astro 言語サポート（上流由来、MIT）
docs/                   # 設計ドキュメント
saas/                   # Phase 4 以降の SaaS 専用ロジック置き場（現在は空）
tmp/upstream/           # withastro/astro-playground のスナップショット（git 管理外、参考用）
NOTICE, THIRD_PARTY_NOTICES.md  # MIT 帰属表示
```

## セットアップ手順（Phase 1）

1. 前提: Node.js 24 以上、pnpm 11（`packageManager` フィールドで自動的に 11.x が使われる）
2. `pnpm install`
3. `cp apps/playground/.dev.vars.example apps/playground/.dev.vars` を作成し、必要な値を設定
   - ローカル LLM だけなら変更不要（`OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL` は既定値でよい）
   - 外部 LLM を使う場合は `CF_AI_GATEWAY_URL`（`https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}`）と `CF_AI_GATEWAY_TOKEN`、BYOK を Gateway に登録していなければ各 `*_API_KEY`
4. ローカル LLM を起動（詳細は `LOCAL_LLM.md`）
   - Ollama: `ollama serve` と `ollama pull qwen2.5-coder:7b` など
   - LM Studio: Developer タブで Start Server、モデルをロード
5. `pnpm dev` → http://localhost:4321
   - Astro 7 の `astro dev` は daemon 化される。停止は `pnpm --filter @prestell/playground run dev:stop`（= `astro dev stop`）
   - `/api/*` も同じプロセス（workerd）で動くので `wrangler dev` は不要
6. 参考用スナップショットが必要なら `tmp/README.md` のコマンドで `tmp/upstream/` を再取得

## 開発コマンド（リポジトリルート）

| コマンド | 内容 |
|---|---|
| `pnpm dev` | dev サーバー起動（workerd） |
| `pnpm check` | `tsc --noEmit`（playground + lang-astro） |
| `pnpm test` | Vitest |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm build` | `astro build` |

## Phase 1 の実装状況と残タスク

実装済み:
1. `/api/chat`（AI SDK `streamText`、SSE ストリーミング、プロバイダー切替）
2. `/api/models`（プロバイダー一覧・ローカルモデル一覧）
3. `/api/mcp-proxy` と `docsMode: tools | inject | off`
4. チャットパネル（提案カード、コンパイラ検証、自動適用）
5. ローカル保存（File System Access API / ダウンロード）

残タスク:
- AI Gateway 経由の外部 LLM（Claude 等）での E2E 確認（Ollama qwen2.5-coder:7b と LM Studio google/gemma-4-e4b は確認済み）
- AI Gateway 経由での `stream` / `tools` 透過の実測（不可なら provider-native endpoint に切替）
- 複数ファイル（相対 import）対応の検証（ストレッチ）

## チューニング用の定数（`apps/playground/src/lib/config.ts`）

| 定数 | 既定値 | 意味 |
|---|---|---|
| `COMPILE_DEBOUNCE_MS` | 200 | 最後のキー入力から WASM コンパイルまでの待ち時間（ローカル処理） |
| `PREVIEW_DEBOUNCE_MS` | 0 | コンパイル成功からサーバー側レンダリング（`/api/render`）までの追加待ち時間。デプロイ時のコスト削減はまずここを上げる |
| `PREVIEW_TIMEOUT_MS` | 5000 | プレビューのタイムアウト |
| `COMPILER_TIMEOUT_MS` | 8000 | コンパイラ Worker のタイムアウト（超過で再起動） |

UI 側にも出力ペイン右上の「Auto」トグルがあり、OFF にすると手入力編集での自動レンダリング自体を止められる（↻ で手動描画、設定は localStorage `prestell.preview.auto` に保存。`src/lib/preview-settings.ts`）。コンパイルと Diagnostics は常に自動。

## コーディング規約・注意点

- 言語: TypeScript。Workers 側（`src/pages/api`, `src/server`）も TypeScript
- Biome（タブインデント、ダブルクォート）。`pnpm lint:fix` で整形
- シークレットは `apps/playground/.dev.vars` のみ（git 管理外）。`.env` / `.dev.vars` をコミットしない
- 上流由来のファイルには `Derived from withastro/astro-playground (MIT)` ヘッダーを残す
- LLM 生成コードは必ず `src/lib/ai/apply.ts` の `validateProposal`（コンパイラ診断 + `validatePreview`）を通してからエディタに反映する
- SaaS 専用ロジック（課金、マルチユーザー管理）は `saas/` に分離し、Phase 1〜3 では `apps/` から参照しない
- ブラウザから Astro Docs MCP やローカル LLM に直接接続しない（CORS）。常に `/api/*` を経由する

## テスト・動作確認の指針
- 各プロバイダー（Ollama / LM Studio / Anthropic / OpenAI / Workers AI）で最低1回はチャット→コード生成→プレビュー反映の E2E 確認を行う
- MCP 接続が失敗した場合でもチャット機能自体は継続動作すること（グレースフルデグラデーション）を確認する
- ローカル LLM が未起動のとき、UI に分かりやすいヒントが出ることを確認する
- 提案コードに `import` や `client:*` が含まれる場合、適用前に「Cannot render」として拒否されることを確認する

## Claude Code への依頼例（プロンプトサンプル）

```
docs/ARCHITECTURE.md の Phase 1 構成に従い、
apps/playground の /api/chat に「直近の会話をまとめてプロンプトテンプレートを提案する」
エンドポイントを追加してください。プロバイダー切替は src/server/ai/providers.ts の
resolveModel を再利用し、レスポンスは AI SDK の UI message stream で返してください。
```

## 参照ドキュメント
- `.claude/CLAUDE.md`: プロジェクト全体のガイド
- `OVERVIEW.md`: プロダクト概要・要件
- `ARCHITECTURE.md`: システム構成の詳細
- `ROADMAP.md`: フェーズごとのタスクリスト
- `LOCAL_LLM.md`: ローカル LLM（Ollama / LM Studio）接続の仕様
