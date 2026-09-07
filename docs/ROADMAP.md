# ROADMAP.md

## Phase 1: ローカルMVP（個人利用）
**目標**: Cloudflare無料枠内で完結する、自分専用のAstro AIビルダーを動かす。

- [x] `withastro/astro-playground` を参考に `apps/playground` を構築し、`pnpm dev`（astro dev = workerd）でエディタ + Preview が動くことを確認
- [x] チャットUIパネルを追加（プロンプト入力→送信→ストリーミング表示）
- [x] Cloudflare AI Gateway をローカルから接続して実測（2026-09-06）。Anthropic（`claude-sonnet-4.5`、BYOK パススルー）と Workers AI（`@cf/meta/llama-4-scout-17b-16e-instruct`）でストリーミングと `docsMode: tools`（`search_astro_docs` → 回答）を確認。詳細は `LOCAL_LLM.md` の「Cloudflare AI Gateway」節
- [x] Astro Docs MCP Server を接続し、tool calling（`docsMode: tools`）と事前検索埋め込み（`docsMode: inject`）を実装
- [x] LLM の生成コードをコンパイラで検証してエディタに反映し、Preview が更新されることを確認
- [x] Ollama（qwen2.5-coder:7b）と LM Studio（google/gemma-4-e4b）のローカルモデルで「プロンプト→生成→検証→適用→Preview」と切替を確認（`LOCAL_LLM.md` 参照）
- [x] 生成コードをローカルファイルシステムに書き出す機能を実装（File System Access API / ダウンロード）
- [ ] （ストレッチ）複数ファイル・相対 import 対応の検証 → Phase 5「サイトビルダー」の技術検証として実施する

**完了条件**: 自分ひとりで「プロンプト→コード生成→プレビュー確認→ローカル保存」のループが問題なく回ること。

## Phase 2: 検証・改善
**目標**: 実利用での精度・使い勝手を上げる。

- [x] 複数LLMでの生成品質を比較検証（2026-09-06。`pnpm eval` の評価ハーネスで Claude Haiku 4.5 / Workers AI 2 種を比較。GPT / Gemini / Ollama はハーネス対応済みで未実行。結果と所見は `EVALUATION.md`、記録は `docs/evaluations/`）
- [x] MCP経由のAstro知識活用が実際にハルシネーションを減らしているか検証（2026-09-06。Astro 5 の API 8 問で docsMode off / inject / tools を比較。inject で全モデルのハルシネーションが 0 になり正答率も上昇。`EVALUATION.md`）
- [x] チャット履歴の保持・複数プロジェクト管理機能を追加（2026-09-06。ブラウザ内 IndexedDB に保存、1 プロジェクト = 1 スレッド。保存層は `ProjectStore` インターフェースで抽象化し、Phase 5 の Durable Objects 実装に差し替え可能。URL ハッシュは Share 時のみ生成し、`#code=` 付き URL は新規プロジェクトとして取り込む）
- [x] 生成コードのコンパイル検証に失敗したとき、エラー内容を LLM に自動で返して修正案を再生成する fix ループ（上限回数付き。既定 2 回、最大 5 回、Stop で中断可。2026-09-06）
- [x] エラー時のリトライ・フォールバック処理を実装（2026-09-06。LLM: ストリーム前 2 回リトライ + 無応答タイムアウト、クライアントで一時的エラーは自動リトライ 1 回、Retry / Retry with <フォールバック先> ボタン。MCP: 接続 8 秒タイムアウト + 1 回リトライ、失敗時は docs なしで継続しチャットに通知）
- [x] プロンプトテンプレート（コンポーネント生成、レイアウト生成、スタイル調整等）を整備（2026-09-06。組み込み 18 種を `src/lib/ai/templates.ts` に定義し、コンポーザー横の Template… から挿入。`[...]` プレースホルダーを選択状態にする。スタイル調整系は現在のコンポーネントに対してそのまま送信できる）

**完了条件**: 日常的に個人の開発作業で問題なく使える状態になること。

## Phase 3: OSS公開
**目標**: ローカル実行部分をコミュニティに公開し、フィードバックを得る。

- [x] OSS化する範囲を確定（フロントエンド、Workers設定、MCP接続ロジック、LOCAL_LLM連携部分）（2026-09-07。このリポジトリの追跡ファイルすべてが公開対象。`OSS_SCOPE.md`）
- [x] SaaS運営専用ロジック（課金、マルチユーザー管理）を分離したリポジトリ構成にする（`saas/`）（2026-09-07。実装は private リポジトリ `prestell-ui-saas` に置き、`saas/` は境界を示す README のみ。拡張点は `OSS_SCOPE.md`）
- [x] ライセンス選定（MIT or Apache 2.0）、README・CONTRIBUTING整備（2026-09-07。Apache 2.0 で確定し `package.json` に明記。README を英語化して `README.ja.md` を併置、`CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `SECURITY.md` / `.github/`（テンプレート・CI）を追加）
- [x] APIキー等のシークレット管理を環境変数化し、リポジトリに一切含まれないことを確認（2026-09-07。`.dev.vars` / `.env` は git 管理外、履歴にキーなし、`.dev.vars.example` は全 9 変数を網羅。点検記録と再点検コマンドは `OSS_SCOPE.md`。author メールの書き換えは public 化前に実施）
- [x] GitHubにpublicリポジトリとして公開（2026-09-07。https://github.com/c-tomioka/prestell-ui 、`v0.1.0`。公開後の設定は `OSS_SCOPE.md` の「公開手順」）

**完了条件**: 第三者がクローンしてローカルで同じ体験を再現できること。

## Phase 4: 静的ホスト版（BYOK 前提・運営は課金しないプレビュー公開）
**目標**: サーバーコストほぼゼロで公開できる「静的フロント + 最小 API」構成に切り替え、ユーザー自身の API キー（BYOK）で AI 機能を使える公開版を出す。

- [x] プレビューのレンダリングをブラウザ内 Web Worker で行うレンダラーを実装し、既定にする（`PUBLIC_PREVIEW_RENDERER=browser|server` で切替。設計: `PREVIEW_RENDERING.md`）
- [ ] AI direct モード: ブラウザから Ollama / LM Studio / Anthropic / OpenAI / Google AI Studio を直接呼ぶ（AI SDK をクライアントで実行。キーはメモリまたは sessionStorage に保持し、URL や localStorage に置かない）
- [ ] AI Gateway / Workers AI のブラウザ直接呼び出し（CORS）可否を検証し、不可なら direct モードの対象外と明記
- [ ] Astro Docs MCP 用の最小中継 Worker（Workers Free、Worker Loader 不要）を用意し、静的フロントから利用
- [ ] プレビュー用の別オリジン（例: `preview.<domain>`）+ sandbox iframe + CSP（`connect-src 'none'` 等）で生成コードを隔離
- [ ] 静的ビルド構成（`/api/*` を切り離し、フロントを Cloudflare Pages 等の無料枠で配信）
- [ ] BYOK の説明 UI（レート制限・請求はユーザー自身のキーに紐づく旨）と、モード切替（server / direct）の設定 UI

**完了条件**: 運営側の固定費なし（静的配信 + Workers Free の中継のみ）で、第三者が自分のキーを入れて生成→プレビューできること。

## Phase 5: サイトビルダー（複数ファイル・Astro プロジェクト出力）
**目標**: 1 コンポーネントの生成器から、ページ・レイアウト・コンポーネント・CSS・画像を持つサイト（LP / HP）を生成・編集し、そのまま `astro dev` で動く Astro プロジェクトとして書き出せるビルダーにする。content collections / API routes / SSR は Phase 6。

方針（2026-09-07 確定）:
- 実装は「パス → 内容のファイルマップ + プレビューの入口ファイル」という **1 つの多ファイルモデル**に統一し、Component / Page / Site の 3 モードは初期ファイル・AI プロンプト・UI 表示のプリセットとして載せる（旧 1 ファイル実装を別経路として残さない）。
- 参考: Svelte Playground / Vue SFC Playground（仮想ファイル群 + ブラウザ内 import 解決）。上流 Astro Playground は単一コンポーネント専用で、複数ファイルを想定していない。
- 画像はコンパイラ型 Playground と同じく「AI は URL / プレースホルダー / SVG（テキスト）を書く」を基本にし、ユーザーがアップロードした画像だけを `public/` 配下のバイナリとして保持する。`astro:assets`（`<Image />`、`import` した画像）はビルドパイプラインが要るため対象外。

- [ ] 技術検証: 複数 `.astro` ファイルのコンパイルと相対 import の解決（browser レンダラーは Blob URL のモジュールグラフに書き換え、server レンダラーは Worker Loader の `modules` に同梱）。`.css` の import、`public/` 配下のパス参照も含める
- [ ] プロジェクトモデルの多ファイル化: `source` を `files: Record<path, text | Blob>` に変え、プレビューの入口ファイルとモード（`component` / `page` / `site`）を持たせる。IndexedDB スキーマ v2 へのマイグレーション（既存プロジェクトは Component モードとして自動変換）
- [ ] モード: Component（`Component.astro` 1 本、自己完結・import 禁止、ツリー非表示）/ Page（`src/pages/index.astro` + `src/layouts/Layout.astro`）/ Site（Page + `src/components/`、複数ページとページ切替）。Component → Page への昇格を提供
- [ ] ファイルツリー UI: **画面左端（エディタの左）**に配置。タブ、追加・改名・削除・移動、Component モードでは折りたたみ
- [ ] ページプレビュー: 入口ファイルの選択とページ切替、レイアウト・コンポーネント・CSS の import、`public/` 配下の画像を `blob:` URL に書き換えて表示。Phase 4 の別オリジン sandbox iframe + CSP の上に載せ、外部画像の読み込みを許可する
- [ ] 画像: アップロードを `public/` 配下の Blob として IndexedDB に保持（上限の目安: 1 ファイル 2 MB、1 プロジェクト 20 MB）。SVG はテキストファイルとして編集・AI 生成の対象にする
- [ ] AI の多ファイル生成: モード別のシステムプロンプト（Component は現状の import 禁止を維持）、パス付きコードブロックの出力形式、複数ファイルの検証・適用・fix ループ、画像は URL / プレースホルダー / SVG に限定する指示、Page / Site 向けテンプレート（LP 生成、セクション分割、ページ追加など）
- [ ] 書き出し: Site / Page は Astro プロジェクトの ZIP（`package.json`、`astro.config.mjs`、`tsconfig.json`、`public/`、`src/`）と File System Access API によるディレクトリ書き込み。Component は従来の 1 ファイル保存
- [ ] Share URL: 多ファイルは `#code=` に収まらないため、対象を Component モードに限定するか別形式にするかを決める
- [ ] 評価ハーネス（`pnpm eval`）の多ファイル対応と、`OVERVIEW.md` / `ARCHITECTURE.md` / `PREVIEW_RENDERING.md` / README（EN/JA）の更新

**完了条件**: Site モードで LP を生成→プレビュー→ZIP 出力し、展開先で `npm install && npm run dev` を実行するとプレビューと同じ表示になること。既存の Component プロジェクトが移行後もそのまま使えること。

## Phase 6: Astro フル機能（content collections / API routes / SSR）
**目標**: Phase 5 のサイトビルダーを、ブラウザ内 WASM コンパイラだけでは動かない Astro の機能まで広げる。

- [ ] 実行環境の選定: content collections / API routes / SSR をプレビューするために、Worker Loader（`server` レンダラーの拡張）か WebContainers 系か、あるいはプレビュー非対応で出力のみ対応かを比較して決める
- [ ] content collections（`src/content/`、`content.config.ts`）の生成・編集・プレビュー
- [ ] API routes（`src/pages/api/*.ts`）と SSR（`export const prerender = false`、アダプター設定）の生成と書き出し
- [ ] `astro:assets`（`<Image />`、`src/assets/` の import）への対応可否の判断
- [ ] フレームワークコンポーネント（React / Svelte 等）と `client:*` ディレクティブへの対応可否の判断

**完了条件**: 選定した実行環境の上で、content collections を使ったブログ型サイトを生成→プレビュー→出力できること（プレビュー非対応と決めた機能は、出力したプロジェクトが `astro dev` で動くことを完了条件にする）。

## Phase 7: SaaS化準備
**目標**: マルチユーザー対応の本番環境を構築する。

- [ ] Cloudflare本番環境（Workers Paid検討）へのデプロイ。隔離実行が必要な機能は `server` レンダラー（Worker Loader）を選択
- [ ] Durable Objectsでユーザーごとのセッション状態・チャット履歴を管理
- [ ] R2で生成ファイルを永続化
- [ ] 必要であればCloudflare Containersでサーバーサイド実行環境を追加（WebContainerで対応できない処理がある場合のみ）
- [ ] GitHub App経由でのリポジトリpush機能を実装
- [ ] マルチユーザーでの認証（Cloudflare Access or 独自Auth）を実装

**完了条件**: 複数ユーザーが同時に安全に利用できる状態になること。

## Phase 8: 事前クレジット決済モデルでの販売
**目標**: 収益化を開始する。

- [ ] Stripe on Workersで事前クレジット購入フローを実装
- [ ] AI Gatewayの使用量ログ（トークン数/Neuron数）をユーザーごとに集計し、クレジット残高から消費する仕組みを実装
- [ ] プラン設計（無料枠 + クレジット購入 or サブスク+クレジット併用等）を確定
- [ ] 利用規約・料金ページ・オンボーディングフローを整備
- [ ] 一般公開・マーケティング開始

**完了条件**: 決済〜利用〜残高消費が安定して回り、外部ユーザーへの一般公開が可能な状態になること。

## マイルストーン早見表

| Phase | 主目的 | 想定コスト |
|---|---|---|
| 1 | 個人ローカルMVP | LLM API利用料のみ |
| 2 | 精度・UX改善 | 同上 |
| 3 | OSS公開 | 無償公開のみ、追加コストなし |
| 4 | 静的ホスト版（BYOK） | 静的配信 + Workers Free の中継のみ、ほぼゼロ |
| 5 | サイトビルダー（複数ファイル・Astro プロジェクト出力） | 追加コストなし（ブラウザ内で完結） |
| 6 | Astro フル機能（content collections / API routes / SSR） | 実行環境の選定次第（Worker Loader なら Workers Paid） |
| 7 | 本番マルチユーザー基盤構築 | Workers Paid等の固定費が発生し得る |
| 8 | 課金開始・一般販売 | Stripe決済手数料 + インフラ費 + LLM APIコスト |
