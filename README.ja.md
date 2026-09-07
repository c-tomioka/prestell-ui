# Prestell UI

[![CI](https://github.com/c-tomioka/prestell-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/c-tomioka/prestell-ui/actions/workflows/ci.yml) [![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE.txt)

> AI チャットで [Astro](https://astro.build/) のコンポーネントを生成・編集し、本物の Astro コンパイラで検証してブラウザ上で即座にプレビューする開発ツール。

[English README](./README.md)

Prestell UI は Astro 公式の [Astro Playground](https://github.com/withastro/astro-playground) をベースにした「Astro 版 v0 / bolt.new」です。ローカルでは Cloudflare Workers ランタイム（`astro dev` = workerd）上で動き、ローカル LLM とクラウド LLM の両方に対応し、[Astro Docs MCP Server](https://docs.astro.build/en/reference/developer-tools/#astro-docs-mcp-server) を使って最新の Astro API に沿ったコードを生成します。

![Prestell UI: エディタ、ライブプレビュー、提案を適用した AI チャット](./docs/assets/screenshot.png)

## 特徴

- **チャットからコードへ** – 単一ファイルの Astro コンポーネントを生成・編集。提案は `@astrojs/compiler`（WASM）でコンパイルし、レンダリングできないコードはエディタに入る前に弾きます。
- **ブラウザ内ライブプレビュー** – Web Worker 上の `astro/container` でレンダリング（サーバー往復なし）。Cloudflare Worker Loader によるサーバー側レンダリングにも切替可能。
- **ローカル / クラウド LLM** – Ollama・LM Studio（API キー不要）、または Cloudflare AI Gateway 経由の Anthropic Claude・OpenAI・Google Gemini・Workers AI（BYOK）。
- **2 つの接続モード** – **Server** はこのアプリの `/api/chat` を経由（キーは `.dev.vars` に置く）、**Direct** はブラウザが自分のキーで Ollama・LM Studio・Anthropic・OpenAI・Google AI Studio を直接呼ぶ（API サーバー不要）。
- **MCP による Astro 知識** – `inject`（既定）は送信前に Astro Docs を検索して埋め込み、`tools` はモデル自身に検索させます。評価では `inject` が全モデルで Astro API のハルシネーションを 0 にしました（[docs/EVALUATION.md](./docs/EVALUATION.md)）。
- **自動 fix ループ** – コンパイルエラーを該当行の本文つきでモデルに返し、上限回数まで自動で修正させます。
- **プロジェクトとテンプレート** – プロジェクトとチャット履歴を IndexedDB に保存、組み込みプロンプトテンプレート 18 種、`.astro` ファイルへのワンクリック保存（File System Access API / ダウンロード）。

## ステータス

**2026-09-07 に公開（`v0.1.0`）**。[ロードマップ](./docs/ROADMAP.md) の Phase 3 は完了し、Phase 4「静的ホスト版（BYOK）」に着手中です。direct 接続モードは実装済みで、次は Astro docs の中継 Worker、別オリジンのプレビュー sandbox、静的ビルド構成です。メンテナーが日常的に単一コンポーネントの生成に使っています。プレビューは自己完結した 1 つの `.astro` コンポーネントが対象で、`import`・フレームワークコンポーネント・`client:*`・外部スクリプトには未対応です。静的ホスト版（BYOK）、複数ファイルのサイトビルダー（ページ・レイアウト・コンポーネント・CSS・画像を Astro プロジェクトとして出力）、SaaS 版は後のフェーズで、SaaS 専用コードはこのリポジトリの外にあります（[docs/OSS_SCOPE.md](./docs/OSS_SCOPE.md)）。

## 必要環境

- Node.js 24 以上、pnpm 11（`packageManager` フィールドで自動選択）
- 任意: ローカルモデル用の [Ollama](https://ollama.com/) または [LM Studio](https://lmstudio.ai/)
- 任意: クラウドモデル・Workers AI 用の Cloudflare アカウント（[AI Gateway](https://developers.cloudflare.com/ai-gateway/)）

## クイックスタート

```bash
git clone https://github.com/c-tomioka/prestell-ui.git
cd prestell-ui
pnpm install
cp apps/playground/.dev.vars.example apps/playground/.dev.vars   # ローカル LLM だけなら編集不要
pnpm dev                                                           # http://localhost:4321
```

dev サーバーは daemon 化されるので停止は `pnpm dev:stop` です。`/api/*` も同じ workerd プロセスで動くため `wrangler dev` は不要です。

API キーなしで試すには:

```bash
ollama pull qwen2.5-coder:7b
ollama serve
```

AI chat パネルで **Ollama (local)** を選び、モデルを選択して次のようなプロンプトを送ります。

```text
Make a pricing section with three tiers and a highlighted middle plan. Use a blue accent.
```

## LLM プロバイダー

設定はすべて `apps/playground/.dev.vars`（git 管理外。雛形は `.dev.vars.example`）に書きます。

| プロバイダー | 必要なもの | 環境変数 |
|---|---|---|
| Ollama | 手元で `ollama serve` | `OLLAMA_BASE_URL`（既定 `http://localhost:11434/v1`） |
| LM Studio | ローカルサーバーの起動（GUI または `lms server start`） | `LMSTUDIO_BASE_URL`（既定 `http://localhost:1234/v1`） |
| Workers AI | Cloudflare AI Gateway | `CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN`, `CF_AI_GATEWAY_ID` |
| Anthropic / OpenAI / Google | AI Gateway とプロバイダーのキー（Gateway 側に保存した BYOK / Unified Billing、またはローカルに置いてパススルー） | 上の 3 つに加えて `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` |
| Astro Docs MCP | なし | `ASTRO_DOCS_MCP_URL`（既定 `https://mcp.docs.astro.build/mcp`） |

Server モードではローカルサーバーへブラウザではなく Workers ランタイムから接続するため、CORS の設定は不要です（Direct モードでは必要。次節）。`.dev.vars` は絶対にコミットしないでください（[SECURITY.md](./SECURITY.md)）。

## 接続モード

AI chat パネル上部の **Connection** でリクエストの経路を選びます。

| モード | 経路 | キーの置き場所 | 使えるプロバイダー |
|---|---|---|---|
| Server（既定） | ブラウザ → `/api/chat`（Workers ランタイム）→ プロバイダー | サーバーの `.dev.vars` | 上の表の全部 |
| Direct | ブラウザ → プロバイダー（API サーバーを介さない） | パネルに貼り付け。このタブの `sessionStorage` にだけ保持し、`localStorage` や URL には置かない | Ollama、LM Studio、Anthropic、OpenAI、Google AI Studio |

Direct モードは静的ホスト版の土台です。利用量やレート制限は自分のキーに課金され、Astro docs は MCP サーバーに CORS がないため小さな中継（今は `/api/mcp-proxy`、後に単体の Worker）経由で取得します。Cloudflare AI Gateway と Workers AI はブラウザから呼べない（preflight 応答に CORS ヘッダーがない。2026-09-07 確認）ため、Workers AI は Server モード限定です。

dev サーバーなしで Direct モードを使う（静的ホスト構成）には、docs 中継 Worker を自分の Cloudflare アカウントにデプロイし、フロントをそこへ向けます。

```bash
pnpm relay:deploy                                                    # Workers Free で十分
PUBLIC_DOCS_PROXY_URL=https://prestell-docs-relay.<you>.workers.dev/search pnpm build
```

中継（`apps/playground/relay/`）は `search_astro_docs` を転送するだけで、シークレットを持たず、Origin 許可リスト（`relay/wrangler.jsonc` の `ALLOWED_ORIGINS`）と IP ごとのレート制限があります。`pnpm relay:dev` でローカル 8788 番に起動できます。中継は匿名で到達できる必要があります。アカウント設定で `workers.dev` が既定で Cloudflare Access 保護される場合は、この Worker の Access ポリシーを Everyone に対する **Bypass** にする（またはこの Worker だけ保護を外す）でください。そうしないとブラウザの preflight が CORS ヘッダーではなく Access のログインページを受け取り、チャットは「Astro docs unavailable」にフォールバックします。確認は `curl -X OPTIONS https://…/search -H "Origin: https://your-front-end" -i` で、リダイレクトではなく `Access-Control-Allow-Origin` が返れば OK です。

Direct モードでローカルサーバーを使うにはブラウザのオリジンを許可する必要があります。Ollama は `localhost` 系オリジンを既定で許可（それ以外は `OLLAMA_ORIGINS=<origin>`）、LM Studio は `lms server start --cors` か Developer タブの **Enable CORS** が必要です。詳細と検証記録は [docs/LOCAL_LLM.md](./docs/LOCAL_LLM.md)。

## プレビューのレンダリング

既定はブラウザ内 Web Worker です。上流 Playground と同じサーバー側レンダリング（Worker Loader）を使うには:

```bash
pnpm dev:server
```

現在のモードは出力ペインのバッジで確認できます。設計は [docs/PREVIEW_RENDERING.md](./docs/PREVIEW_RENDERING.md)。

## 使い方

1. http://localhost:4321 を開く。左がエディタ、中央がプレビュー、右が AI chat（ツールバーの **AI chat** で開閉）。
2. **Connection**（Server / Direct）、プロバイダー、モデルを選ぶ。**Astro docs** で MCP のモードを切り替える（既定は `inject`）。
3. 作りたいコンポーネントを書くか、**Template…** からプロンプトテンプレートを選ぶ。`⌘/Ctrl+Enter` で送信。
4. 検証に通った提案は自動でエディタに反映され、プレビューが更新される。通らなかった場合は自動 fix ループが動く（**Apply anyway** で強制適用も可）。
5. 追加の指示で調整し、**Save** で `.astro` ファイルとして保存する。

ローカル LLM での詳しい動作確認手順は [docs/LOCAL_LLM.md](./docs/LOCAL_LLM.md) にあります。

## ドキュメント

- [OVERVIEW.md](./docs/OVERVIEW.md) – プロダクトの目的と要件
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) – システム構成と技術選定
- [ROADMAP.md](./docs/ROADMAP.md) – フェーズとタスク
- [DEVELOPMENT.md](./docs/DEVELOPMENT.md) – セットアップ詳細、チューニング定数、手動テストの指針
- [LOCAL_LLM.md](./docs/LOCAL_LLM.md) – Ollama / LM Studio 連携と動作確認手順
- [PREVIEW_RENDERING.md](./docs/PREVIEW_RENDERING.md) – browser / server レンダラーの比較
- [EVALUATION.md](./docs/EVALUATION.md) – LLM 品質・ハルシネーション評価ハーネス（`pnpm eval`）と所見
- [OSS_SCOPE.md](./docs/OSS_SCOPE.md) – OSS 公開範囲、SaaS との境界、シークレット点検記録

## コントリビュート

Issue と Pull Request は日本語・英語どちらでも歓迎です。まず [CONTRIBUTING.md](./CONTRIBUTING.md) を読んでください。行動規範は [Contributor Covenant](./CODE_OF_CONDUCT.md)、脆弱性の報告は [SECURITY.md](./SECURITY.md) の手順で非公開に行ってください。

## ライセンス

[Apache License 2.0](./LICENSE.txt)。一部のコードは [Astro Playground](https://github.com/withastro/astro-playground)（MIT License, Copyright (c) 2022 Astro）から派生しています。派生ファイルには由来を示すヘッダーコメントを付け、MIT ライセンス全文を [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) に収録しています。

## 謝辞

- [Astro](https://astro.build/) と [Astro Playground](https://play.astro.build/)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) と Workers
- [Vercel AI SDK](https://ai-sdk.dev/)
- [Ollama](https://ollama.com/) と [LM Studio](https://lmstudio.ai/)
