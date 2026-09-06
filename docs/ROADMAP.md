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
- [ ] （ストレッチ）複数ファイル・相対 import 対応の検証

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
- [ ] ライセンス選定（MIT or Apache 2.0）、README・CONTRIBUTING整備
- [ ] APIキー等のシークレット管理を環境変数化し、リポジトリに一切含まれないことを確認
- [ ] GitHubにpublicリポジトリとして公開

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

## Phase 5: SaaS化準備
**目標**: マルチユーザー対応の本番環境を構築する。

- [ ] Cloudflare本番環境（Workers Paid検討）へのデプロイ。隔離実行が必要な機能は `server` レンダラー（Worker Loader）を選択
- [ ] Durable Objectsでユーザーごとのセッション状態・チャット履歴を管理
- [ ] R2で生成ファイルを永続化
- [ ] 必要であればCloudflare Containersでサーバーサイド実行環境を追加（WebContainerで対応できない処理がある場合のみ）
- [ ] GitHub App経由でのリポジトリpush機能を実装
- [ ] マルチユーザーでの認証（Cloudflare Access or 独自Auth）を実装

**完了条件**: 複数ユーザーが同時に安全に利用できる状態になること。

## Phase 6: 事前クレジット決済モデルでの販売
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
| 5 | 本番マルチユーザー基盤構築 | Workers Paid等の固定費が発生し得る |
| 6 | 課金開始・一般販売 | Stripe決済手数料 + インフラ費 + LLM APIコスト |
