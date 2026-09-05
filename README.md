# Prestell UI
Astro 版 v0 ライクツール

> AIチャットでAstroサイトを生成・編集し、ブラウザ上で即座にプレビューできる開発環境。

Astro公式Playgroundをベースに、自然言語でUI・ページ・コンポーネントを生成・編集するための実験的なツールです。Astro Docs MCP Serverを利用してAstroの最新ドキュメントを参照しながらコードを生成し、生成結果はライブプレビューで確認できます。

## 特徴

- AIチャットによるAstroコンポーネント・ページの生成と編集
- ブラウザ上でのライブプレビュー（既定はブラウザ内レンダリング。サーバー側レンダリングにも切替可）
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

`astro dev` は Cloudflare Workers ランタイム（workerd）上で動き、`/api/*` も同じプロセスで提供されるため、`wrangler dev` を別途起動する必要はありません。dev サーバーは daemon 化されるので、停止は `pnpm dev:stop` です。

### プレビューのレンダリング場所

既定では **ブラウザ内の Web Worker** が Astro コンポーネントをレンダリングします（サーバー呼び出しなし、静的ホスティングでも動く構成）。上流の Astro Playground と同じ **サーバー側レンダリング**（Cloudflare Worker Loader、`/api/render`）に切り替えたい場合は環境変数で指定します。

```bash
# ブラウザ内レンダリング（既定）
pnpm dev

# サーバー側レンダリング
pnpm dev:server
# または
PUBLIC_PREVIEW_RENDERER=server pnpm dev
```

現在のモードは出力ペイン右上のバッジ（`browser` / `server`）で確認できます。

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

```bash
# LM Studio: 同梱の lms CLI でモデルを取得し、サーバー起動とロードを行う（GUI でも可）
alias lms="/Applications/LM Studio.app/Contents/Resources/app/.webpack/lms"   # 初回に lms bootstrap を実行すると PATH に入る
lms get qwen/qwen2.5-coder-7b-instruct -y
lms server start --port 1234
lms load qwen/qwen2.5-coder-7b-instruct -y
```

アプリ上でプロバイダーとして「Ollama (local)」または「LM Studio (local)」を選ぶと、利用可能なモデルが候補に出ます。どちらも Worker から直接接続するため、CORS 設定は不要です。詳細は [`docs/LOCAL_LLM.md`](./docs/LOCAL_LLM.md) を参照してください。

## ローカルLLMでの動作確認手順（Ollama / LM Studio）

外部 API キーなしで「プロンプト → 生成 → 検証 → 適用 → Preview」のループが動くことを目視で確認する手順です。手順 1 は使うサーバーに合わせて A（Ollama）か B（LM Studio）のどちらかを行います。

1-A. Ollama: モデルを取得してサーバーを起動する（初回のみ pull、約 4.7GB）

   ```bash
   ollama pull qwen2.5-coder:7b
   ollama serve
   ```

   別ターミナルで `curl http://localhost:11434/v1/models` を実行し、`qwen2.5-coder:7b` が含まれていれば準備完了です。

1-B. LM Studio: モデルをロードしてローカルサーバーを起動する

   GUI の場合:
   - LM Studio を起動し、Discover（虫眼鏡）からコード向けモデル（例: `qwen2.5-coder-7b-instruct`）をダウンロードする
   - 左のナビゲーションで Developer（`<>` アイコン）を開き、上部のトグルで **Start Server**（既定ポート 1234）
   - 「Select a model to load」でモデルをロードする（JIT ロードが有効なら未ロードでも初回リクエスト時に自動でロードされる）

   CLI の場合（アプリ同梱の `lms` を使う。`lms bootstrap` を一度実行すると `~/.lmstudio/bin/lms` が作られ PATH に入る）:

   ```bash
   alias lms="/Applications/LM Studio.app/Contents/Resources/app/.webpack/lms"
   lms get qwen/qwen2.5-coder-7b-instruct -y   # ダウンロード（既にあるモデルは lms ls で確認）
   lms server start --port 1234                # CORS 指定は不要（Worker から直接接続するため）
   lms load qwen/qwen2.5-coder-7b-instruct -y  # メモリにロード
   lms ps                                      # ロード済みモデルと識別子を確認
   ```

   `curl http://localhost:1234/v1/models` にモデルが含まれていれば準備完了です。モデル ID は LM Studio が表示する識別子（例: `google/gemma-4-e4b`）をそのまま使います。

2. dev サーバーを起動してブラウザで開く

   ```bash
   pnpm dev
   ```

   http://localhost:4321 を開くと、左にエディタ、中央に Preview、右に AI chat パネルが表示されます。
   AI chat パネルが閉じている場合はツールバー右上の「AI chat」を押してください。

3. AI chat パネルで Provider を「Ollama (local)」または「LM Studio (local)」にする
   - Model 欄にサーバーの先頭モデル（例: `qwen2.5-coder:7b` / `google/gemma-4-e4b`）が自動で入ります（候補は `/api/models` が各サーバーの `/v1/models` から取得）。以前選んだモデルがサーバーに無い場合も先頭候補に置き換わります
   - 「Ollama が起動していません」「LM Studio のサーバーが起動していません」等のヒントが出る場合は手順 1 を確認してください
   - 「Auto-apply valid proposals」がオンになっていることを確認します

4. プロンプトを送る（⌘/Ctrl+Enter でも送信できます）

   ```text
   Make a pricing section with three tiers and a highlighted middle plan. Use a blue accent.
   ```

5. 次の順に変化することを目視で確認する
   - Assistant の返答がストリーミングで表示され、「Component proposal」カードに「Generating…」と行数が出る
   - 生成完了後にカードが「Validating…」→「Applied to editor」に変わる
   - 左のエディタが生成コードに置き換わり、中央の Preview が再描画される（7B クラスのモデルで 10〜40 秒程度）
   - Preview タブ以外（JS / CSS / Diagnostics）でもコンパイル結果が確認できる
   - 出力ペイン右上の「Auto」を OFF にしてエディタを編集すると Preview は変わらず「Changes not rendered」が出る。↻ を押すと再描画される

6. 検証が働くことを確認する（任意）

   ```text
   Reuse a Card component imported from ./Card.astro
   ```

   `import` は Preview 非対応のため、カードが「Cannot render」となり、エディタは変更されません。「Apply anyway」で強制適用もできます。

7. 保存を確認する（任意）
   - ツールバーの「Save」を押すと `.astro` ファイルとして保存できます（Chromium は保存先ダイアログ、他ブラウザはダウンロード）

8. 終了する

   ```bash
   pnpm dev:stop
   # LM Studio を CLI で起動した場合
   lms unload --all && lms server stop
   ```

Astro Docs を参照させたい場合は「Astro docs」を `inject`（ローカルモデル推奨）にしてください。

## 使い方

1. 開発サーバーを起動します
2. ブラウザでPlaygroundを開きます
3. 右側の AI chat パネルで LLM プロバイダーとモデルを選択します（「Astro docs」で MCP の使い方を切替）
4. チャットに作りたいコンポーネントを入力します
5. 提案されたコードは Astro コンパイラで検証され、問題なければ自動でエディタに反映されて Preview が更新されます
   - 出力ペイン右上の「Auto」トグルを OFF にすると、手入力の編集では Preview を再描画しません。↻ ボタンを押したときだけ描画します（未反映の変更があるとドットとバナーで知らせます）。AI 提案の適用時は OFF でも 1 回描画します
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
- [`PREVIEW_RENDERING.md`](./docs/PREVIEW_RENDERING.md): プレビューのレンダリング方式（browser / server）と比較
- [`DEVELOPMENT.md`](./docs/DEVELOPMENT.md): ローカル開発環境の詳細

## ライセンス

このリポジトリは [Apache License 2.0](./LICENSE.txt) で提供します。

一部のコードは [Astro Playground](https://github.com/withastro/astro-playground)（MIT License, Copyright (c) 2022 Astro）から派生しています。派生ファイルには由来を示すヘッダーコメントを付け、MIT ライセンス全文を [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) に収録しています。

## 謝辞

- [Astro](https://astro.build/)
- [Astro Playground](https://play.astro.build/)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [Ollama](https://ollama.com/)
