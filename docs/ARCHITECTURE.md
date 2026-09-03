# ARCHITECTURE.md

## システム構成図（Phase 1: ローカルMVP）

```
[ブラウザ]
  └─ play.astro.build フォークUI (Astro/React)
       ├─ チャットパネル（プロンプト入力）
       └─ ライブプレビュー（WebContainer相当の実行環境）
            │
            ▼ fetch / WebSocket (SSE)
[ローカルWorkers (wrangler dev / Miniflare)]
  ├─ /api/chat        … プロンプト受信 → AI Gatewayへ中継
  ├─ /api/mcp-proxy    … Astro Docs MCP Serverへの接続プロキシ
  └─ /api/files        … 生成コードの保存/読み込み（ローカルFS）
            │
            ▼
[Cloudflare AI Gateway]
  ├─ Custom Provider: Ollama (http://localhost:11434/v1) ローカルLLM
  ├─ Provider: OpenAI / Anthropic / Google 等（BYOKキー）
  └─ Provider: Workers AI（Cloudflare運営、無料枠あり）
            │
            ▼（Tool calling / MCP経由）
[Astro Docs MCP Server]（公式ホスト or セルフホスト）
            │
            ▼
生成コード → WebContainer内でビルド・プレビュー
            │
            ▼
ローカルファイルシステムへ書き出し（将来: Git push）
```

## コンポーネント別詳細

### 1. フロントエンド
- ベース: `withastro/astro-playground` をフォーク
- 追加要素: チャットUIパネル（サイドバー形式）、LLM選択ドロップダウン（Ollama含む）、Git連携ボタン（Phase 3以降）
- 実行環境: WebContainer（ブラウザ内Node.js仮想化）を維持し、サーバー側の実行コストを発生させない

### 2. バックエンド（Cloudflare Workers）
- `wrangler dev` でローカル実行し、Cloudflareにデプロイせず個人利用が可能
- ルーティング:
  - `POST /api/chat`: チャット履歴 + プロンプトをAI Gatewayに送信、SSEでストリーミング返却
  - `POST /api/mcp-proxy`: LLMのtool call要求をAstro Docs MCP Serverに中継
  - `GET/POST /api/files`: 生成ファイルの読み書き（Phase1はローカルFS、Phase4以降はR2）

### 3. AI Gateway層
- Cloudflare AI GatewayのCustom Providers機能でOllama（`localhost:11434`のOpenAI互換API）を登録
- 外部LLM（Claude, GPT, Gemini等）はBYOKで登録し、ユーザー自身のAPIキーを使用
- Workers AIは無料枠（1日10,000 Neurons）でAPIキー不要の検証にも使える
- ログ・使用量分析はAI Gateway標準機能（Workers Freeで10万ログまで無料）を利用
- 詳細な切替設計は `LOCAL_LLM.md` を参照

### 4. MCP連携
- Astro Docs MCP Serverをツールとして登録し、LLMがコード生成前に最新のAstroドキュメントを検索・参照できるようにする
- セルフホストする場合はローカルWorkers内でMCPクライアントとして中継する構成も可

### 5. コード保存・反映
- Phase 1: File System Access API等でローカルディスクに直接書き出し
- Phase 3以降: GitHub App経由でOAuth取得し、Git Data APIでコミット・push

## Phase 4以降（SaaS化）の追加構成

```
[Cloudflare Pages/Workers 本番環境]
  ├─ Durable Objects … ユーザーごとのセッション状態・チャット履歴・クレジット残高
  ├─ R2 … 生成ファイルの永続化
  ├─ Cloudflare Containers … サーバーサイドでのAstro devサーバー実行（必要時のみ）
  ├─ GitHub App … リポジトリpush連携
  └─ Stripe (Workers上でネイティブSDK動作) … 事前クレジット課金・Webhook処理
```

## 技術選定まとめ

| 領域 | 採用技術 | 理由 |
|---|---|---|
| フォーク元 | withastro/astro-playground | MITライセンス、Astro公式、WebContainer実行基盤が既にある |
| LLM抽象化 | Cloudflare AI Gateway | 複数プロバイダー統一、BYOK、Ollamaカスタムプロバイダー対応 |
| Astro知識源 | Astro Docs MCP Server | 常に最新のAstro構文・APIに基づく生成 |
| ローカル実行 | Wrangler dev / Miniflare | Cloudflare本番環境と同じコードでローカル動作 |
| 将来の課金 | Stripe on Workers | WorkersでStripe公式JS SDKがネイティブ動作 |
| 状態管理（SaaS化後） | Durable Objects | 強整合性のセッション/残高管理 |

## 設計上の制約
- WebContainerはブラウザのサンドボックス内で動作するため、ネイティブアドオン・長時間稼働プロセス・実際のPython実行等は不可
- Astro DBのような本格的バックエンド機能はブラウザ内では動作しない可能性があり、必要になった時点でCloudflare Containers移行を検討する
