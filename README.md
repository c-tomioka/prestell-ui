# prestell-ui
Astro 版 v0 ライクツール (Astro AI Playground)

> AIチャットでAstroサイトを生成・編集し、ブラウザ上で即座にプレビューできる開発環境。

Astro公式Playgroundをベースに、自然言語でUI・ページ・コンポーネントを生成・編集するための実験的なツールです。Astro Docs MCP Serverを利用してAstroの最新ドキュメントを参照しながらコードを生成し、生成結果はライブプレビューで確認できます。

## 特徴

- AIチャットによるAstroコンポーネント・ページの生成と編集
- ブラウザ上でのライブプレビュー
- 複数LLMプロバイダーの切り替え
  - Anthropic Claude
  - OpenAI
  - Google Gemini
  - Cloudflare Workers AI
  - OllamaなどのローカルLLM
- Astro Docs MCP Serverを利用したAstro固有の知識参照
- 生成したプロジェクトのローカル保存
- 将来的なGitHubリポジトリ連携・SaaS提供を予定

## ステータス

現在は**ローカルMVPの開発段階**です。個人利用を前提に、AI生成・ライブプレビュー・ローカルLLM連携の基本ループを構築しています。

## 必要環境

- Node.js（推奨: 現行LTS）
- pnpm（またはリポジトリで指定するパッケージマネージャー）
- Cloudflareアカウント（AI GatewayまたはWorkers AIを使用する場合）
- 任意のLLM APIキー
  - Anthropic APIキー
  - OpenAI APIキー
  - Google AI APIキー
- Ollama（ローカルLLMを使用する場合）

## セットアップ

```bash
# リポジトリを取得
git clone https://github.com/<your-org>/<your-repo>.git
cd <your-repo>

# 依存関係をインストール
pnpm install

# 環境変数を作成
cp .env.example .env

# 開発サーバーを起動
pnpm dev
```

Cloudflare Workers APIをローカルで起動する構成の場合は、別ターミナルで以下を実行します。

```bash
wrangler dev
```

## 環境変数

`.env.example` をコピーして `.env` を作成し、利用するプロバイダーに応じて設定してください。

```dotenv
# Cloudflare AI Gateway
CF_AI_GATEWAY_URL=
CF_AI_GATEWAY_TOKEN=

# 外部LLM（必要なものだけ設定）
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=

# ローカルLLM（Ollama）
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_DEFAULT_MODEL=

# Astro Docs MCP Server
ASTRO_DOCS_MCP_URL=
```

APIキーやトークンをGitにコミットしないでください。`.env` は必ず`.gitignore`に含めます。

## Ollamaを使う

Ollamaを使うと、外部LLM APIを使わずにローカルモデルでコード生成を試せます。

```bash
# Ollamaをインストール後、コード向けモデルを取得する例
ollama pull qwen2.5-coder

# 必要に応じてOllamaサーバーを起動
ollama serve
```

アプリケーション上でプロバイダーとして「Ollama」を選び、利用可能なローカルモデルを指定してください。ローカルLLM対応の詳細は [`LOCAL_LLM.md`](./LOCAL_LLM.md) を参照してください。

## 使い方

1. 開発サーバーを起動します
2. ブラウザでPlaygroundを開きます
3. 使用するLLMプロバイダーとモデルを選択します
4. チャットに作りたいUIやページを入力します
5. 生成されたコードとライブプレビューを確認します
6. 追加の指示でデザインや実装を調整します
7. 満足したらプロジェクトをローカルへエクスポートします

### プロンプト例

```text
プロダクト紹介用のランディングページをAstroで作成してください。
ヒーロー、3つの機能紹介、料金セクション、CTA、フッターを含めてください。
スタイルはミニマルで、アクセントカラーは青にしてください。
```

```text
このページのヒーローを、左側に見出しとCTA、右側にダッシュボードのモックを置く2カラム構成に変更してください。
モバイルでは縦並びになるようにしてください。
```

## プロジェクトドキュメント

実装方針・開発手順・ロードマップの詳細は次のドキュメントを参照してください。

- [`OVERVIEW.md`](./docs/OVERVIEW.md): プロダクトの目的と要件
- [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md): システム構成と技術選定
- [`ROADMAP.md`](./docs/ROADMAP.md): 開発フェーズとロードマップ
- [`LOCAL_LLM.md`](./docs/LOCAL_LLM.md): OllamaなどローカルLLMとの接続
- [`DEVELOPMENT.md`](./docs/DEVELOPMENT.md): ローカル開発環境の詳細

## ライセンス

ライセンスは公開時に決定します。フォーク元および利用する依存パッケージのライセンスも確認してください。

## 謝辞

- [Astro](https://astro.build/)
- [Astro Playground](https://play.astro.build/)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [Ollama](https://ollama.com/)
