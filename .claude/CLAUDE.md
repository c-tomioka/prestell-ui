# 指示書

このファイルはClaude Codeがこのリポジトリで作業する際に最初に読み込むプロジェクトガイドです。

## プロジェクト概要
Astro公式Playground（`withastro/astro-playground`）をフォークし、AIチャットでAstroのUIコードを生成・編集できるビルダー（Astro版 v0 / bolt.new）を構築する。詳細は `OVERVIEW.md` を参照。

## ドキュメント構成
リポジトリの `docs/` ディレクトリに配置されている。

- `OVERVIEW.md`: プロダクト概要・要件定義
- `ARCHITECTURE.md`: システム構成・技術選定
- `ROADMAP.md`: フェーズ別タスクリスト
- `LOCAL_LLM.md`: Ollama等ローカルLLM接続の仕様
- `PREVIEW_RENDERING.md`: プレビューレンダラー（browser / server）の設計・比較・セキュリティ方針
- `EVALUATION.md`: LLM 生成品質・MCP ハルシネーションの評価ハーネス（`pnpm eval`）と最新の所見。記録は `docs/evaluations/`
- `OSS_SCOPE.md`: OSS 公開範囲、SaaS 専用ロジック（private リポジトリ `prestell-ui-saas`）との境界、シークレット管理の点検記録

リポジトリルートには公開向けの `README.md`（英語）/ `README.ja.md`（日本語）、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`、`.github/`（Issue / PR テンプレート、CI）がある。README の内容を変えるときは両言語を更新する。
- `DEVELOPMENT.md`: セットアップ手順・実装優先順・コーディング規約

作業前に必ず `ARCHITECTURE.md` と `ROADMAP.md` の該当フェーズを確認し、現在のフェーズ範囲外の実装（特にSaaS化・課金関連）に着手しないこと。

## リポジトリ構成方針
- フォーク元コード（Playground本体）とAI機能追加コードを明確に分離する
- 将来のOSS公開を前提に、SaaS専用ロジック（課金・マルチユーザー管理）は `saas/` ディレクトリに分離し、Phase 1〜3では極力触れない
- シークレット（APIキー等）は絶対にコミットしない。`.env` は必ず `.gitignore` に含める

## コーディング規約
- 言語: TypeScript優先。Workers側もTypeScriptで統一
- 生成AIコードのファイル書き込みは必ずバリデーションを経由させる（WebContainerで実行不能なコードを弾く）
- 破壊的変更を伴う変更は、まずブランチを切って提案してから適用する
- コミットメッセージは変更内容を明確に（英語推奨、日本語も可。`CONTRIBUTING.md` に準拠）

## 作業時の確認事項
- 新機能追加時: `ROADMAP.md` の該当フェーズのチェックリストに対応しているか確認
- LLMプロバイダー関連の変更: `LOCAL_LLM.md` の設計に従っているか確認
- 環境構築・実行コマンドが不明な場合: `DEVELOPMENT.md` を参照

## 質問・提案の仕方
不明点や設計判断が必要な場合は、実装前に選択肢を提示して確認を取ること。特にAI Gatewayのプロバイダー切替ロジックや、MCPサーバー接続方式など、アーキテクチャに影響する変更は独断で行わない。

## 現在のフェーズ
Phase 3 完了（2026-09-07 に public 化、`v0.1.0`）。Phase 4「静的ホスト版（BYOK）」は 2026-09-08 に完了: AI direct モード（ブラウザ → LLM、`src/lib/ai/direct/*`）、AI Gateway / Workers AI の CORS 検証（direct 非対応）、Astro Docs MCP の中継 Worker（`apps/playground/relay/`）、別オリジンのプレビュー sandbox（`src/pages/preview/`、`PUBLIC_PREVIEW_ORIGIN`）、静的ビルド構成（`pnpm build:static`、`wrangler.static.jsonc`、`PUBLIC_AI_CONNECTIONS`）、BYOK の説明 UI（`DirectModeHelp.svelte`）、i18n（`src/lib/i18n/`、EN / 日本語）まで完了。UI 文言は直書きせず `src/lib/i18n/en.ts` にキーを追加して `ja.ts` にも訳を入れる。Phase 5「サイトビルダー（複数ファイル・Astro プロジェクト出力）」は 2026-09-08 に実装項目を完了: 複数モジュールのプレビュー（`src/lib/preview-graph.ts`）、プロジェクトモデル v2（`files` + `entry` + `mode`、v1 は読み出し時に移行）、モードプリセット、ファイルツリー、ページ切替、ZIP / フォルダー書き出し（`src/lib/export-project.ts`）、画像アップロードと `data:` URL によるプレビュー解決（`src/lib/preview-assets.ts`）、AI の多ファイル生成（`src/lib/ai/project-context.ts`、`extractProposalFiles`、`validateProjectProposal`、Page / Site テンプレート）、評価ハーネスの `PROJECT_CASES`。Share URL は Component 限定と決定。AI 出力契約（パス付きコードブロック）を変えるときは `/api/chat`・direct transport・評価ハーネスの 3 か所を揃える。次は実測（`pnpm eval`）と Phase 6「Astro フル機能」（`ROADMAP.md`、`ARCHITECTURE.md`）。公開範囲と境界は `OSS_SCOPE.md`、フェーズの全体像は `ROADMAP.md` を参照。Phase 7〜8（SaaS・課金）には着手しない。
