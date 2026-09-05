# ARCHITECTURE.md

## システム構成図（Phase 1: ローカルMVP）

```
[ブラウザ]  apps/playground（Astro 7 + Svelte 5）
  ├─ エディタ（CodeMirror 6 + @prestell/codemirror-astro）
  ├─ Astro コンパイラ（@astrojs/compiler の WASM を Web Worker で実行）
  ├─ 出力タブ（Preview / JS / CSS / Scripts / Metadata / Diagnostics / AST / Source map）
  └─ AI チャットパネル（@ai-sdk/svelte、プロバイダー・モデル選択、提案カード）
            │ fetch / SSE（同一オリジン）
            ▼
[Cloudflare Workers ランタイム（astro dev = workerd / 本番 Workers）]
  ├─ POST /api/render     … コンパイル済み JS を Worker Loader で動的 Worker として起動し
  │                          Astro Container API で HTML にレンダリング（上流と同方式）
  ├─ POST /api/chat       … AI SDK streamText。プロバイダー切替、Astro Docs MCP の tools / inject
  ├─ GET  /api/models     … プロバイダー一覧・ローカルモデル一覧
  └─ POST /api/mcp-proxy  … Astro Docs MCP の search_astro_docs を1回呼ぶブリッジ
            │
            ├─ ローカル LLM: Ollama / LM Studio（http://localhost:*/v1、Worker から直接 fetch）
            ├─ Cloudflare AI Gateway Unified API（/compat/chat/completions、BYOK）
            │     └─ Anthropic / OpenAI / Google AI Studio / Workers AI
            └─ Astro Docs MCP Server（https://mcp.docs.astro.build/mcp、Streamable HTTP）
            
生成コード → コンパイラで検証（validateProposal）→ エディタへ反映 → Preview 更新
            → File System Access API / ダウンロードでローカル保存
```

## 上流 Playground の実態（調査結果）

- `withastro/astro-playground` は **WebContainer を使っていない**。ブラウザ内の WASM コンパイラと、Cloudflare **Worker Loader（Dynamic Workers）** 上での Astro Container API レンダリングでプレビューを実現している。
- プレビューは **単一 `.astro` コンポーネント**のみ。`import`、フレームワークコンポーネント、`client:*`、外部 `<script src>`、Server Islands は `validatePreview()` で弾かれる。
- `astro dev` が Cloudflare Vite plugin 経由で workerd を起動するため、`wrangler dev` を別途動かす必要はない。`/api/*` も同じプロセスで動く。
- Dynamic Workers はローカル（miniflare）では無料で動くが、本番は **Workers Paid 限定**（open beta、$0.002/Worker/日、beta 中は免除）。Phase 1 はローカル限定なので影響なし。

## コンポーネント別詳細

### 1. フロントエンド（`apps/playground`）
- 上流の Playground を参考に再構成（派生ファイルには MIT 帰属ヘッダー）。上流スナップショットは `tmp/upstream/`（git 管理外）。
- 追加要素: `src/components/chat/*`（ChatPanel / ProviderSelect / MessageList / CodeProposal）、Toolbar の「AI chat」「Save」ボタン。
- 提案コードの反映: `src/lib/ai/extract-code.ts` で応答の ```astro フェンスを抽出 → `src/lib/ai/apply.ts` がコンパイラで検証（診断エラー・Preview 非対応構文を拒否）→ 合格なら `Playground.svelte` の通常経路でエディタ置換 → 再コンパイル → Preview 更新。
- 設定（プロバイダー、モデル、docsMode、自動適用、パネル開閉）は localStorage に保持。

### 2. バックエンド（`apps/playground/src/pages/api`, `src/server/ai`）
- `POST /api/chat`: `{ messages, provider, model, docsMode, filename, source }` を受け取り、AI SDK の `streamText` で UI message stream（SSE）を返す。現在のエディタ内容は毎回 system prompt に埋め込む。
- `GET /api/models`: プロバイダー一覧（設定済みかどうか）と、ローカルサーバーの `/v1/models` を中継。
- `POST /api/mcp-proxy`: `search_astro_docs` を1回実行して結果を返す（inject モードと手動検索用）。
- `POST /api/render`: 上流同等のプレビューレンダラー。
- 環境変数は `.dev.vars`（`astro dev` が自動ロード）を `cloudflare:workers` の `env` から読む。

### 3. LLM プロバイダー層（`src/server/ai/providers.ts`）
- すべて OpenAI 互換 `/chat/completions` なので `@ai-sdk/openai-compatible` 1本で統一。
- ローカル: Ollama / LM Studio へ Worker から直接 fetch（API キー不要）。
- クラウド: AI Gateway Unified API `{CF_AI_GATEWAY_URL}/compat`、モデルは `anthropic/…`, `openai/…`, `google-ai-studio/…`, `workers-ai/…`。認証は `cf-aig-authorization`（Gateway）+ 任意の `Authorization`（BYOK 未登録時のプロバイダーキー）。
- AI Gateway の Custom Providers は HTTPS 必須のため localhost の Ollama は登録できない（`LOCAL_LLM.md` 参照）。

### 4. MCP 連携（`src/server/ai/mcp.ts`）
- `@ai-sdk/mcp` の `createMCPClient({ transport: { type: "http", url } })`。
- `docsMode: "tools"`: `mcp.tools()` を `streamText` に渡す（最大5ステップ）。
- `docsMode: "inject"`: 直近のユーザー発話で検索し、上位数件を system prompt に埋め込む（tool calling が弱いローカルモデル向け）。
- MCP 接続失敗時はドキュメントなしで継続（グレースフルデグラデーション）。

### 5. コード保存
- Phase 1: `src/lib/export.ts`。Chromium は File System Access API（保存先を選択）、それ以外は `<a download>`。
- Worker 側の `/api/files` は実装しない（workerd はローカル FS に書けない）。複数ファイル化時に ZIP export を検討。

## Phase 4以降（SaaS化）の追加構成

```
[Cloudflare Workers 本番環境（Workers Paid: Worker Loader 利用のため必須）]
  ├─ Durable Objects … ユーザーごとのセッション状態・チャット履歴・クレジット残高
  ├─ R2 … 生成ファイルの永続化
  ├─ Cloudflare Containers … サーバーサイドでの Astro dev 実行（必要時のみ）
  ├─ GitHub App … リポジトリ push 連携
  └─ Stripe (Workers 上でネイティブ SDK 動作) … 事前クレジット課金・Webhook 処理
```

## 技術選定まとめ

| 領域 | 採用技術 | 理由 |
|---|---|---|
| ベース | withastro/astro-playground（参考） | MIT、Astro 公式、WASM コンパイラ + Worker Loader のプレビュー基盤 |
| フロント | Astro 7 + Svelte 5 + CodeMirror 6 | 上流と同じ構成で移植コストを最小化 |
| LLM 呼び出し | Vercel AI SDK（ai / @ai-sdk/openai-compatible / @ai-sdk/svelte / @ai-sdk/mcp） | ストリーミング・tool loop・MCP を SDK に委譲 |
| LLM 抽象化 | Cloudflare AI Gateway Unified API + ローカル直結 | クラウドは1エンドポイント、ローカルは無料・キー不要 |
| Astro 知識源 | Astro Docs MCP Server | 常に最新の Astro 構文・API |
| ローカル実行 | `astro dev`（workerd） | 本番 Workers と同じランタイム |
| 将来の課金 | Stripe on Workers | Workers で Stripe SDK がネイティブ動作 |
| 状態管理（SaaS化後） | Durable Objects | 強整合性のセッション/残高管理 |

## 設計上の制約
- プレビューは単一コンポーネント・自己完結が前提。複数ファイル（相対 import）対応は Worker Loader の `modules` に複数モジュールを同梱する方式で Phase 1 後半に検証する。
- WASM コンパイラのため COOP/COEP（`credentialless`）ヘッダーが必須。同一オリジンの `/api/*` には影響しない。
- ブラウザから Astro Docs MCP / ローカル LLM に直接接続しない（CORS）。常に Worker を経由する。
