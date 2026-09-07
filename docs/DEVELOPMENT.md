# DEVELOPMENT.md

Claude Code での開発時に参照するセットアップ手順・実装優先順・コーディング規約。

## リポジトリ構成

```
apps/playground/        # プロダクト本体（Astro 7 + Svelte 5 + Cloudflare Workers ランタイム）
packages/lang-astro/    # CodeMirror 用 Astro 言語サポート（上流由来、MIT）
docs/                   # 設計ドキュメント
saas/                   # SaaS 専用ロジックの境界を示すプレースホルダー（実装は private リポジトリ prestell-ui-saas。docs/OSS_SCOPE.md）
tmp/upstream/           # withastro/astro-playground のスナップショット（git 管理外、参考用）
NOTICE, THIRD_PARTY_NOTICES.md  # MIT 帰属表示
.github/                # Issue / PR テンプレート、CI（lint → check → test）
README.md, README.ja.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md  # 公開向けドキュメント
```

## セットアップ手順（Phase 1）

1. 前提: Node.js 24 以上、pnpm 11（`packageManager` フィールドで自動的に 11.x が使われる）
2. `pnpm install`
3. `cp apps/playground/.dev.vars.example apps/playground/.dev.vars` を作成し、必要な値を設定
   - ローカル LLM だけなら変更不要（`OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL` は既定値でよい）
   - `PUBLIC_PREVIEW_RENDERER` だけは Vite の `.env` から読む。変えたいときは `apps/playground/.env.example` を `.env` にコピーする（シークレットは書かない）
   - 外部 LLM を使う場合は `CF_AI_GATEWAY_URL`（ダッシュボードの REST API URL `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai`）、`CF_AI_GATEWAY_TOKEN`（Workers AI Read 権限の API トークン）、`CF_AI_GATEWAY_ID`（Gateway 名。Workers AI では必須）。外部プロバイダーのキーは Gateway 側の BYOK / Unified Billing で管理する。旧形式 `gateway.ai.cloudflare.com/v1/...` も受け付ける
4. ローカル LLM を起動（詳細は `LOCAL_LLM.md`）
   - Ollama: `ollama serve` と `ollama pull qwen2.5-coder:7b` など
   - LM Studio: Developer タブで Start Server、モデルをロード
5. `pnpm dev` → http://localhost:4321
   - Astro 7 の `astro dev` は daemon 化される。停止は `pnpm dev:stop`（= `astro dev stop`）
   - `/api/*` も同じプロセス（workerd）で動くので `wrangler dev` は不要
   - プレビューは既定でブラウザ内 Web Worker がレンダリングする（サーバー呼び出しなし）。上流と同じサーバー側レンダリングを試すときは `pnpm dev:server`
6. 参考用スナップショットが必要なら `tmp/README.md` のコマンドで `tmp/upstream/` を再取得

## 開発コマンド（リポジトリルート）

| コマンド | 内容 |
|---|---|
| `pnpm dev` | dev サーバー起動（プレビューはブラウザ内レンダリング = 既定） |
| `pnpm dev:server` | サーバー側レンダリング（`/api/render`, Worker Loader）で起動 |
| `pnpm check` | `tsc --noEmit`（playground + lang-astro） |
| `pnpm test` | Vitest |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm build` | `astro build` |
| `pnpm eval` | LLM 生成品質・MCP ハルシネーションの評価ハーネス（dev サーバー起動が前提。`EVALUATION.md`） |
| `pnpm relay:dev` / `pnpm relay:deploy` | Astro docs 中継 Worker（`apps/playground/relay/`）をローカル 8788 番で起動 / 自分の Workers アカウントへデプロイ（`ARCHITECTURE.md` 1d） |

## Phase 1 の実装状況と残タスク

実装済み:
1. `/api/chat`（AI SDK `streamText`、SSE ストリーミング、プロバイダー切替）
2. `/api/models`（プロバイダー一覧・ローカルモデル一覧）
3. `/api/mcp-proxy` と `docsMode: tools | inject | off`
4. チャットパネル（提案カード、コンパイラ検証、自動適用）
5. ローカル保存（File System Access API / ダウンロード）

Phase 2 で追加済み:
- プロジェクト管理とチャット履歴の保存（`src/lib/projects/*`、IndexedDB）。Toolbar の project メニューで New / Rename / Delete / 切替
- コンパイル検証失敗時の fix ループ（`src/lib/ai/fix-loop.ts`、チャット設定で ON/OFF と上限回数）

残タスク:
- （Phase 1 の残タスクなし。Ollama / LM Studio / AI Gateway 経由の Claude と Workers AI で E2E 確認済み）
- 複数ファイル（相対 import）対応の検証（ストレッチ）
- AI direct モード（ブラウザから LLM を直接呼ぶ BYOK 構成）は Phase 4 で実装済み（チャット設定の Connection。`ARCHITECTURE.md` 1c、`LOCAL_LLM.md`）

## チューニング用の定数（`apps/playground/src/lib/config.ts`）

| 定数 | 既定値 | 意味 |
|---|---|---|
| `COMPILE_DEBOUNCE_MS` | 200 | 最後のキー入力から WASM コンパイルまでの待ち時間（ローカル処理） |
| `PREVIEW_DEBOUNCE_MS` | 0 | コンパイル成功からサーバー側レンダリング（`/api/render`）までの追加待ち時間。デプロイ時のコスト削減はまずここを上げる |
| `PREVIEW_TIMEOUT_MS` | 5000 | プレビューのタイムアウト |
| `COMPILER_TIMEOUT_MS` | 8000 | コンパイラ Worker のタイムアウト（超過で再起動） |
| `PROJECT_SAVE_DEBOUNCE_MS` | 500 | 最後の編集からプロジェクトを IndexedDB に保存するまでの待ち時間（切替・離脱時は即時保存） |

リトライ・タイムアウト（`apps/playground/src/lib/ai/resilience.ts`、server / direct 共通。クライアント側の分類は `src/lib/ai/errors.ts`）:

| 定数 | 既定値 | 意味 |
|---|---|---|
| `LLM_MAX_RETRIES` | 2 | ストリーム開始前（接続・HTTP 失敗）のリトライ回数 |
| `LLM_FIRST_CHUNK_TIMEOUT_MS` | 60000 | 最初のトークンまでの待ち時間（ローカルモデルのロードを許容） |
| `LLM_CHUNK_TIMEOUT_MS` | 30000 | ストリーム中の無応答で打ち切るまでの時間 |
| `MCP_CONNECT_TIMEOUT_MS` | 8000 | Astro Docs MCP の接続タイムアウト |
| `MCP_TOOL_TIMEOUT_MS` | 10000 | `search_astro_docs` 1 回のタイムアウト |
| `MCP_RETRIES` | 1 | MCP 接続・検索の追加試行回数 |
| `AUTO_RETRY_DELAY_MS` / `MAX_AUTO_RETRIES` | 1500 / 1 | クライアントの自動リトライ（一時的エラーのみ） |
| `PREVIEW_RENDERER` | `browser` | どこでレンダリングするか。環境変数 `PUBLIC_PREVIEW_RENDERER=browser\|server` から `astro.config.ts` が注入（`apps/playground/.env` にも書ける） |

UI 側にも出力ペイン右上の「Auto」トグルがあり、OFF にすると手入力編集での自動レンダリング自体を止められる（↻ で手動描画、設定は localStorage `prestell.preview.auto` に保存。`src/lib/preview-settings.ts`）。コンパイルと Diagnostics は常に自動。

## コーディング規約・注意点

- 言語: TypeScript。Workers 側（`src/pages/api`, `src/server`）も TypeScript
- Biome（タブインデント、ダブルクォート）。`pnpm lint:fix` で整形
- シークレットは `apps/playground/.dev.vars` のみ（git 管理外）。`.env` / `.dev.vars` をコミットしない。CI が gitleaks で push / PR のコミットを検査する（全履歴の再検査は `OSS_SCOPE.md` の再点検コマンド）。手元でもコミット前に止めたい場合は `brew install gitleaks && git config core.hooksPath .githooks`（opt-in）。`astro build` は `.dev.vars` を `dist/server/` にコピーするので、`dist/` を配布・zip・共有しない（点検記録は `OSS_SCOPE.md`）
- 上流由来のファイルには `Derived from withastro/astro-playground (MIT)` ヘッダーを残す
- LLM 生成コードは必ず `src/lib/ai/apply.ts` の `validateProposal`（コンパイラ診断 + `validatePreview`）を通してからエディタに反映する
- SaaS 専用ロジック（課金、マルチユーザー管理）は `saas/` に分離し、Phase 1〜3 では `apps/` から参照しない
- ブラウザから Astro Docs MCP やローカル LLM に直接接続しない（CORS）。常に `/api/*` を経由する

## テスト・動作確認の指針
- 各プロバイダー（Ollama / LM Studio / Anthropic / OpenAI / Workers AI）で最低1回はチャット→コード生成→プレビュー反映の E2E 確認を行う
- MCP 接続が失敗した場合でもチャット機能自体は継続動作すること（グレースフルデグラデーション）を確認する
- ローカル LLM が未起動のとき、UI に分かりやすいヒントが出ることを確認する。送信時のエラーバナーが JSON の生表示にならず、`Retry` と `Retry with <フォールバック先>`（チャット設定の Fallback で選択）から再送できること
- Astro Docs MCP が到達不能（`.dev.vars` の `ASTRO_DOCS_MCP_URL` を無効な URL にする）でも `docsMode: tools | inject` の返答が 10 秒以内に始まり、「Astro docs unavailable」の通知行が出ること
- 提案コードに `import` や `client:*` が含まれる場合、適用前に「Cannot render」として拒否されることを確認する
- テンプレート: Send の左の Template… から選ぶとコンポーザーに文面が入り、最初の `[...]` が選択される。入力がある状態で選ぶと空行を挟んで追記。Style 系はそのまま Send で現在のコンポーネントが更新されること
- fix ループ: 拒否された提案に対して「🔧 Auto-fix request 1/N」が自動送信され、修正案が valid になれば適用、上限到達で「auto-fix gave up」で止まること。Stop で中断できること。チャット設定の「Auto-fix errors」を OFF にすると従来どおり invalid で止まること
- プロジェクト: New / Rename / Delete と切替でエディタとチャット履歴が入れ替わり、リロード後に最後のプロジェクトが復元されること。Share で得た `#code=` URL を開くと「Shared <filename>」として取り込まれ、ハッシュが消えること
- direct モード（Connection: Direct）: Ollama を選ぶとモデル一覧がブラウザから `http://localhost:11434/v1/models` で取れ、送信すると `/api/chat` を通らずに `localhost:11434/v1/chat/completions` へ preflight + POST が飛ぶこと（DevTools の Network で確認）。Server URL を誤ったポートにすると Model 欄の下に「Cannot reach Ollama … from the browser」の警告が出ること。Anthropic / OpenAI / Google を選ぶと API key 欄が出て、未入力では Send が無効になり「Enter your … API key」の警告が出ること。キーは sessionStorage（`prestell.chat.keys`）にだけ入り、localStorage には無いこと。「Forget all keys」で消えること。Workers AI は「(server only)」で選択不可なこと
- プレビュー sandbox: `pnpm dev` で出力ペインのバッジが「browser · sandboxed」になり、Network に `http://127.0.0.1:4321/preview/`（接続拒否の場合あり）→ `http://[::1]:4321/preview/` の読み込みが出ること。frontmatter に `await fetch("http://localhost:4321/api/models")` と `await indexedDB.databases()` を書いたコンポーネントで、fetch が `Failed to fetch`、DB 一覧が `[]` になること。`while (true)` で 5 秒後に「Preview timed out」となり、New project で次の描画が同じフレームで成功すること。`PUBLIC_PREVIEW_ORIGIN=http://localhost:4321`（アプリと同じ）で起動するとバッジが「browser · not isolated」になること
- 中継 Worker: `pnpm relay:dev` を起動し、`PUBLIC_DOCS_PROXY_URL=http://localhost:8788/search pnpm dev` で開いた direct モードの `inject` / `tools` が `localhost:8788/search` への preflight + POST で動くこと。`curl -X OPTIONS` で `Access-Control-Allow-Origin` が返り、`ALLOWED_ORIGINS` に無い Origin は 403、同じ IP から 60 秒に 31 回目は 429 になること
- direct モードのクラウド 3 社（Anthropic / OpenAI / Google）は自分のキーで 1 回ずつ生成→適用を確認する。401 なら「rejected the API key」、429 なら「rate limiting」のバナーになり Retry できること

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
- `PREVIEW_RENDERING.md`: プレビューレンダラーの設計と比較
- `OSS_SCOPE.md`: OSS 公開範囲・SaaS 境界・シークレット点検記録
- `../CONTRIBUTING.md`: 外部コントリビューター向けの手順と規約（英語）
