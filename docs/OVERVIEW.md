# OVERVIEW.md

## プロダクト名（仮）
Prestell UI

## 一言コンセプト
Astro公式Playground（`play.astro.build` / `withastro/astro-playground`）をフォークし、AIチャットでUIコードを生成・編集できる「Astro版 v0 / bolt.new」を構築する。

## 背景
- `withastro/astro-playground` はMITライセンスのAstro公式リポジトリで、ブラウザ内のWASMコンパイラとCloudflare Worker Loader（Dynamic Workers）によるAstroコンポーネントの即時プレビュー基盤を既に持つ（WebContainerは使っていない。詳細は `ARCHITECTURE.md`）。
- v0.app（Vercel）やbolt.new（StackBlitz）は同様の「チャット→コード生成→ライブプレビュー→デプロイ/Git反映」フローを他フレームワークで実現している。
- Astro特化のAIビルダーは市場にまだ確立されておらず、Astro Docs MCP Serverと組み合わせることでAstro固有の最新構文に基づいた高品質なコード生成が可能になる。

## 開発フェーズの全体像
1. Phase 1: ローカルMVP（個人利用） — Cloudflare無料枠内、APIコストのみ発生
2. Phase 2: 検証・改善 — 複数LLM切替、Ollama対応、MCP精度検証
3. Phase 3: OSS公開 — ローカル実行部分をApache 2.0でGitHub公開
4. Phase 4: 静的ホスト版（プレビュー公開） — BYOK 前提・運営は課金しない。AI direct モード（ブラウザから LLM を直接呼ぶ）と別オリジンのプレビューサンドボックス
5. Phase 5: SaaS化準備 — マルチユーザー対応、Cloudflare本番デプロイ
6. Phase 6: 事前クレジット課金モデルでの販売

各フェーズの詳細タスクは `ROADMAP.md` を参照。

## コア機能要件
- チャットベースのUIでAstroコンポーネント・ページを生成/編集する
- 生成コードをブラウザ内でライブプレビュー表示する（Phase 1 は単一 `.astro` コンポーネント。レンダリングは既定でブラウザ内 Web Worker、任意でサーバー側）
- 満足したらローカルファイルへの反映、または任意のGitHubリポジトリへpush（Phase 3以降）
- LLMは複数プロバイダーから選択可能（Claude, OpenAI, Google, Workers AI, Ollamaローカルモデル等）
- Astro Docs MCP Serverを接続し、常に最新のAstro知識に基づいたコード生成を行う

## 非機能要件
- Phase 1〜3ではCloudflare無料枠（Workers Free, Workers AI free neurons, AI Gateway free logs）に収まること
- ローカル実行を前提とし、Wrangler devやMiniflareで完全に動作すること
- 将来のOSS化を見据え、秘密情報はコードにハードコードせず環境変数化すること
- ローカルLLM（Ollama）接続を必須要件とし、外部APIキーなしでも動作するモードを持つこと（詳細は `LOCAL_LLM.md`）

## スコープ外（現時点）
- Cloudflare Containersを用いたサーバーサイド実行（Phase 5以降で検討）
- Stripeによる課金処理（Phase 6で着手）
- マルチユーザー認証・権限管理（Phase 5以降）
