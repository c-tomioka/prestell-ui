# Prestell UI
Astro 版 v0 ライクツール

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
  - Ollama / LM Studio などのローカルLLM
- Astro Docs MCP Serverを利用したAstro固有の知識参照
- 生成したプロジェクトのローカル保存
- 将来的なGitHubリポジトリ連携・SaaS提供を予定

## ステータス

現在は**ローカルMVPの開発段階**です。個人利用を前提に、AI生成・ライブプレビュー・ローカルLLM連携の基本ループを構築しています。

## 必要環境

- Node.js 24 以上
- pnpm 11（`packageManager` フィールドにより自動選択）
- Cloudflareアカウント（AI GatewayまたはWorkers AIを使用する場合）
- 任意のLLM APIキー
  - Anthropic APIキー
  - OpenAI APIキー
  - Google AI APIキー
- Ollama または LM Studio（ローカルLLMを使用する場合）

## セットアップ

```bash
# リポジトリを取得
git clone https://github.com/<your-org>/<your-repo>.git
cd <your-repo>

# 依存関係をインストール
pnpm install

# 環境変数を作成（ローカルLLMだけなら編集不要）
cp apps/playground/.dev.vars.example apps/playground/.dev.vars

# 開発サーバーを起動（http://localhost:4321）
pnpm dev
```

`astro dev` は Cloudflare Workers ランタイム（workerd）上で動き、`/api/*` も同じプロセスで提供されるため、`wrangler dev` を別途起動する必要はありません。dev サーバーは daemon 化されるので、停止は `pnpm --filter @prestell/playground run dev:stop` です。

## 環境変数

`apps/playground/.dev.vars.example` をコピーして `apps/playground/.dev.vars` を作成し、利用するプロバイダーに応じて設定してください（`astro dev` が自動で読み込みます）。

```dotenv
# ローカルLLM（既定値のままでよい）
OLLAMA_BASE_URL=http://localhost:11434/v1
LMSTUDIO_BASE_URL=http://localhost:1234/v1

# Cloudflare AI Gateway（外部LLMを使う場合）
# https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}
CF_AI_GATEWAY_URL=
CF_AI_GATEWAY_TOKEN=

# 外部LLM（AI Gateway に BYOK 登録していない場合のみ）
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=

# Astro Docs MCP Server
ASTRO_DOCS_MCP_URL=https://mcp.docs.astro.build/mcp
```

APIキーやトークンをGitにコミットしないでください。`.env` と `.dev.vars` は `.gitignore` に含まれています。

## ローカルLLM（Ollama / LM Studio）を使う

外部LLM APIを使わずにローカルモデルでコード生成を試せます。

```bash
# Ollama: コード向けモデルを取得してサーバーを起動
ollama pull qwen2.5-coder:7b
ollama serve
```

LM Studio の場合は Developer タブで Start Server を押し、モデルをロードしてください。アプリ上でプロバイダーとして「Ollama (local)」または「LM Studio (local)」を選ぶと、利用可能なモデルが候補に出ます。詳細は [`docs/LOCAL_LLM.md`](./docs/LOCAL_LLM.md) を参照してください。

## ローカルLLMでの動作確認手順（Ollama）

外部 API キーなしで「プロンプト → 生成 → 検証 → 適用 → Preview」のループが動くことを目視で確認する手順です。

1. モデルを取得して Ollama を起動する（初回のみ pull、約 4.7GB）

   ```bash
   ollama pull qwen2.5-coder:7b
   ollama serve
   ```

   別ターミナルで `curl http://localhost:11434/v1/models` を実行し、`qwen2.5-coder:7b` が含まれていれば準備完了です。

2. dev サーバーを起動してブラウザで開く

   ```bash
   pnpm dev
   ```

   http://localhost:4321 を開くと、左にエディタ、中央に Preview、右に AI chat パネルが表示されます。
   AI chat パネルが閉じている場合はツールバー右上の「AI chat」を押してください。

3. AI chat パネルで Provider を「Ollama (local)」にする
   - Model 欄に `qwen2.5-coder:7b` が自動で入ります（候補は `/api/models` が Ollama から取得）
   - 「Ollama が起動していません」等のヒントが出る場合は手順 1 を確認してください
   - 「Auto-apply valid proposals」がオンになっていることを確認します

4. プロンプトを送る（⌘/Ctrl+Enter でも送信できます）

   ```text
   Make a pricing section with three tiers and a highlighted middle plan. Use a blue accent.
   ```

5. 次の順に変化することを目視で確認する
   - Assistant の返答がストリーミングで表示され、「Component proposal」カードに「Generating…」と行数が出る
   - 生成完了後にカードが「Validating…」→「Applied to editor」に変わる
   - 左のエディタが生成コードに置き換わり、中央の Preview が再描画される（7B モデルで 20〜40 秒程度）
   - Preview タブ以外（JS / CSS / Diagnostics）でもコンパイル結果が確認できる

6. 検証が働くことを確認する（任意）

   ```text
   Reuse a Card component imported from ./Card.astro
   ```

   `import` は Preview 非対応のため、カードが「Cannot render」となり、エディタは変更されません。「Apply anyway」で強制適用もできます。

7. 保存を確認する（任意）
   - ツールバーの「Save」を押すと `.astro` ファイルとして保存できます（Chromium は保存先ダイアログ、他ブラウザはダウンロード）

8. 終了する

   ```bash
   pnpm --filter @prestell/playground run dev:stop
   ```

LM Studio の場合は、アプリの Developer タブで Start Server を押してモデルをロードし、手順 3 で「LM Studio (local)」を選びます。Astro Docs を参照させたい場合は「Astro docs」を `inject`（ローカルモデル推奨）にしてください。

## 使い方

1. 開発サーバーを起動します
2. ブラウザでPlaygroundを開きます
3. 右側の AI chat パネルで LLM プロバイダーとモデルを選択します（「Astro docs」で MCP の使い方を切替）
4. チャットに作りたいコンポーネントを入力します
5. 提案されたコードは Astro コンパイラで検証され、問題なければ自動でエディタに反映されて Preview が更新されます
6. 追加の指示でデザインや実装を調整します
7. 満足したらツールバーの「Save」で `.astro` ファイルをローカルへ保存します

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

このリポジトリは [Apache License 2.0](./LICENSE.txt) で提供します。

一部のコードは [Astro Playground](https://github.com/withastro/astro-playground)（MIT License, Copyright (c) 2022 Astro）から派生しています。派生ファイルには由来を示すヘッダーコメントを付け、MIT ライセンス全文を [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) に収録しています。

## 謝辞

- [Astro](https://astro.build/)
- [Astro Playground](https://play.astro.build/)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [Ollama](https://ollama.com/)
