# ARCHITECTURE.md

## システム構成図（Phase 1: ローカルMVP）

```
[ブラウザ]  apps/playground（Astro 7 + Svelte 5）
  ├─ エディタ（CodeMirror 6 + @prestell/codemirror-astro）
  ├─ Astro コンパイラ（@astrojs/compiler の WASM を Web Worker で実行）
  ├─ プレビューレンダラー（既定 = browser: astro/container を Web Worker で実行、サーバー通信なし）
  ├─ 出力タブ（Preview / JS / CSS / Scripts / Metadata / Diagnostics / AST / Source map）
  └─ AI チャットパネル（@ai-sdk/svelte、プロバイダー・モデル選択、提案カード）
            │ fetch / SSE（同一オリジン）
            ▼
[Cloudflare Workers ランタイム（astro dev = workerd / 本番 Workers）]
  ├─ POST /api/render     … PUBLIC_PREVIEW_RENDERER=server のときだけ使用。コンパイル済み JS を
  │                          Worker Loader で動的 Worker として起動し Astro Container API で HTML 化（上流と同方式）
  ├─ POST /api/chat       … AI SDK streamText。プロバイダー切替、Astro Docs MCP の tools / inject
  ├─ GET  /api/models     … プロバイダー一覧・ローカルモデル一覧
  └─ POST /api/mcp-proxy  … Astro Docs MCP の search_astro_docs を1回呼ぶブリッジ
            │
            ├─ ローカル LLM: Ollama / LM Studio（http://localhost:*/v1、Worker から直接 fetch）
            ├─ Cloudflare AI Gateway Unified API（/compat/chat/completions、BYOK）
            │     └─ Anthropic / OpenAI / Google AI Studio / Workers AI
            └─ Astro Docs MCP Server（https://mcp.docs.astro.build/mcp、Streamable HTTP）
            
生成コード → コンパイラで検証（validateProposal）→ 合格ならエディタへ反映 → Preview 更新
            → 不合格ならエラー文を LLM に返して再生成（fix ループ、既定 2 回まで）
            → File System Access API / ダウンロードでローカル保存
            → プロジェクト（ソース + オプション）とチャット履歴は IndexedDB に自動保存
```

## 上流 Playground の実態（調査結果）

- `withastro/astro-playground` は **WebContainer を使っていない**。ブラウザ内の WASM コンパイラと、Cloudflare **Worker Loader（Dynamic Workers）** 上での Astro Container API レンダリングでプレビューを実現している。
- プレビューは **単一 `.astro` コンポーネント**のみ。`import`、フレームワークコンポーネント、`client:*`、外部 `<script src>`、Server Islands は `validatePreview()` で弾かれる。
- `astro dev` が Cloudflare Vite plugin 経由で workerd を起動するため、`wrangler dev` を別途動かす必要はない。`/api/*` も同じプロセスで動く。
- Dynamic Workers はローカル（miniflare）では無料で動くが、本番は **Workers Paid 限定**（open beta、$0.002/Worker/日、beta 中は免除）。このため本プロダクトは **ブラウザ内レンダリングを既定**にし、Worker Loader 版は `server` モードとして残している（詳細・比較表は `PREVIEW_RENDERING.md`）。

## コンポーネント別詳細

### 1. フロントエンド（`apps/playground`）
- 上流の Playground を参考に再構成（派生ファイルには MIT 帰属ヘッダー）。上流スナップショットは `tmp/upstream/`（git 管理外）。
- 追加要素: `src/components/chat/*`（ChatPanel / ProviderSelect / MessageList / CodeProposal）、Toolbar の「AI chat」「Save」ボタン。
- 提案コードの反映: `src/lib/ai/extract-code.ts` で応答の ```astro フェンスを抽出 → `src/lib/ai/apply.ts` がコンパイラで検証（診断エラー・Preview 非対応構文を拒否）→ 合格なら `Playground.svelte` の通常経路でエディタ置換 → 再コンパイル → Preview 更新。
- 設定（プロバイダー、モデル、docsMode、自動適用、auto-fix の有無と上限、パネル開閉）は localStorage に保持。
- プロジェクト管理（`src/lib/projects/*`）: 1 プロジェクト = 1 コンポーネント + コンパイルオプション + 1 チャットスレッド。`ProjectStore` インターフェース（`types.ts`）を `IdbProjectStore`（IndexedDB `prestell`、ストア `projects` / `chats`）と `MemoryProjectStore`（フォールバック・テスト用）が実装する。エディタは `PROJECT_SAVE_DEBOUNCE_MS` でデバウンス保存、チャットは送信・返答完了・適用時に保存。最後に開いたプロジェクト id は localStorage。起動時の優先順位は `boot.ts` の `resolveInitialProject`（共有 URL の `#code=` > 前回のプロジェクト > 最新 > 新規）。URL ハッシュは Share ボタンを押したときだけ生成する（常時の書き戻しは廃止）。
- プロンプトテンプレート（`src/lib/ai/templates.ts`、`TemplateMenu.svelte`）: Component / Layout / Style の 3 カテゴリ 18 種。コンポーザーに差し込むだけで送信は従来どおり。文面は system prompt の出力契約（props に既定値、単一ファイル、「the current component」）に合わせてある。
- fix ループ（`src/lib/ai/fix-loop.ts`）: `validateProposal` が拒否した提案のエラー文を `buildFixPrompt` で user メッセージにして再送する（`metadata: { kind: "fix", attempt, max }`）。直近の手動メッセージ以降の fix 回数（`pendingFixAttempts`）が上限に達するか、返答にコードブロックがない、Stop / 通信エラーで止まる。サーバー側は無変更（metadata は `convertToModelMessages` が無視する）。送信するメッセージ数は `history.ts` の `trimForRequest` でサーバー上限（60）未満に切り詰め、ローカル履歴は全件残す。

### 1b. プレビューレンダラー（`src/lib/preview.ts`）
- `PreviewRenderer` インターフェース（`render(request, signal)`）を 2 実装が満たす。
  - `BrowserPreviewRenderer`（既定）: `astro.config.ts` が rolldown で `astro/compiler-runtime` と `astro/container` をブラウザ向け ES モジュール文字列にバンドル（仮想モジュール `virtual:preview-browser-bundles`）。`preview-browser.worker.ts` がそれらと compiled component を Blob URL から `import()` し、`AstroContainer.renderToString` する。生成コードの無限ループ等はタイムアウト時に Worker を `terminate()` して次回再生成。
  - `ServerPreviewRenderer`: `POST /api/render`（Worker Loader）。
- 切替は build/dev 時の環境変数 `PUBLIC_PREVIEW_RENDERER`（`pnpm dev` = browser、`pnpm dev:server` = server）。出力ペインのバッジで現在のモードを表示。
- マニフェスト生成（`preview-manifest.ts`）は両実装で共用。`Astro.request.url` は両方 `https://preview.astro.build/` に固定。

### 2. バックエンド（`apps/playground/src/pages/api`, `src/server/ai`）
- `POST /api/chat`: `{ messages, provider, model, docsMode, filename, source }` を受け取り、AI SDK の `streamText` で UI message stream（SSE）を返す。現在のエディタ内容は毎回 system prompt に埋め込む。`streamText` には `maxRetries`（ストリーム前 2 回）と `timeout`（最初のトークン 60 秒、以降の無応答 30 秒）を渡す。docs を使えなかったときは `data-notice` パート（`ChatNotice`）を先頭に書き込んでから本文をマージする（`createUIMessageStream`）。定数は `src/server/ai/resilience.ts`。
- `GET /api/models`: プロバイダー一覧（設定済みかどうか）と、ローカルサーバーの `/v1/models` を中継。
- `POST /api/mcp-proxy`: `search_astro_docs` を1回実行して結果を返す（inject モードと手動検索用）。
- `POST /api/render`: 上流同等のサーバー側プレビューレンダラー（`server` モード時のみ利用）。
- 環境変数は `.dev.vars`（`astro dev` が自動ロード）を `cloudflare:workers` の `env` から読む。

### 3. LLM プロバイダー層（`src/server/ai/providers.ts`）
- すべて OpenAI 互換 `/chat/completions` なので `@ai-sdk/openai-compatible` 1本で統一。
- ローカル: Ollama / LM Studio へ Worker から直接 fetch（API キー不要）。
- クラウド: AI Gateway の REST API `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions`（OpenAI 互換）。認証は Cloudflare API トークン（`Authorization`、Workers AI Read 権限）、Gateway 指定は `cf-aig-gateway-id`。モデルは `anthropic/…`, `openai/…`, `google/…`、Workers AI は `@cf/…`。外部プロバイダーのキーは Gateway 側の BYOK / Unified Billing。旧 `gateway.ai.cloudflare.com/.../compat` 形式も `gatewayConfig()` が判別して対応。
- AI Gateway の Custom Providers は HTTPS 必須のため localhost の Ollama は登録できない（`LOCAL_LLM.md` 参照）。

### 4. MCP 連携（`src/server/ai/mcp.ts`）
- `@ai-sdk/mcp` の `createMCPClient({ transport: { type: "http", url } })`。
- `docsMode: "tools"`: `mcp.tools()` を `streamText` に渡す（最大5ステップ）。
- `docsMode: "inject"`: 直近のユーザー発話で検索し、上位数件を system prompt に埋め込む（tool calling が弱いローカルモデル向け）。
- MCP 接続は 8 秒でタイムアウトし、接続・検索は 1 回リトライする（`resilience.ts` の `withRetry`）。それでも失敗したらドキュメントなしで継続し、チャットに「Astro docs unavailable」の通知行を残す（グレースフルデグラデーション）。

### 4b. エラー処理（`src/lib/ai/errors.ts`, ChatPanel）
- サーバーの `errorResponse` は AI SDK の transport がそのまま `Error.message` にするため、クライアントの `describeChatError` が JSON を剥がして種類（local-down / network / timeout / rate-limit / server / request）を判定する。
- network / timeout / rate-limit / server は「一時的」とみなし、1.5 秒後に `chat.regenerate()` で自動リトライを 1 回だけ行う（バナーに「Retrying…」）。fix ループ中なら「auto-fixing…」のカードを保ったまま再試行する。
- 自動リトライ後も失敗、または一時的でないエラー（ローカル LLM 未起動など）はバナーに `Retry` と、設定でフォールバック先を選んでいれば `Retry with <プロバイダー>` を出す。フォールバックは自動では切り替えない（ユーザー確認済み）。

### 5. コード保存
- Phase 1: `src/lib/export.ts`。Chromium は File System Access API（保存先を選択）、それ以外は `<a download>`。
- Worker 側の `/api/files` は実装しない（workerd はローカル FS に書けない）。複数ファイル化時に ZIP export を検討。

## Phase 4（静的ホスト版）の構成

```
[静的ホスティング（Cloudflare Pages 等の無料枠）]  … フロント一式 + ブラウザ内レンダリング
[別オリジンのプレビューサンドボックス]            … sandbox iframe + CSP（connect-src 'none'）
[Workers Free の最小 API]                          … Astro Docs MCP 中継のみ（Worker Loader 不要）
[ブラウザ → LLM 直接（BYOK）]                      … Ollama / LM Studio / Anthropic / OpenAI / Google
```

## Phase 5以降（SaaS化）の追加構成

```
[Cloudflare Workers 本番環境（`server` レンダラーを使う場合は Workers Paid）]
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
| プレビュー実行 | astro/container を Web Worker で実行（既定）/ Worker Loader（任意） | 無料枠で配信可能、往復なし。隔離実行が必要なら server に切替 |
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
- browser レンダラーでは生成コードがユーザーのブラウザ（同一オリジンの Worker）で実行される。個人利用では許容するが、公開時は別オリジンの sandbox iframe + CSP で隔離する（Phase 4）。`server` レンダラーは Cloudflare 側の隔離環境で通信遮断済み。
- browser レンダラーのバンドルに `node:*` 依存が混入した場合は `astro.config.ts` がビルドを失敗させる（Astro 更新時の検知）。
