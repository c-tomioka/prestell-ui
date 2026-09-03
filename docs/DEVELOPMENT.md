# DEVELOPMENT.md

Claude Codeでの開発時に参照するセットアップ手順・実装優先順・コーディング規約。

## リポジトリのセットアップ手順（Phase 1向け）

1. `withastro/astro-playground` をフォークしてローカルにclone
2. `pnpm install`（リポジトリのpackage.jsonに従いnpm/yarnでも可）
3. Cloudflare Wranglerをインストール: `npm install -g wrangler`
4. プロジェクトルートに `wrangler.toml` を追加し、Workers用エントリポイントを定義
5. `.env.example` を用意し、以下の環境変数を定義:
   - `CF_AI_GATEWAY_URL`
   - `CF_AI_GATEWAY_TOKEN`
   - `ANTHROPIC_API_KEY`（BYOK, オプション）
   - `OPENAI_API_KEY`（BYOK, オプション）
   - `OLLAMA_BASE_URL`（デフォルト: `http://localhost:11434/v1`、詳細は `LOCAL_LLM.md`）
   - `ASTRO_DOCS_MCP_URL`
6. Ollamaをローカルで起動し、コード生成向けモデルを1つ以上pullしておく（`LOCAL_LLM.md`参照）
7. `wrangler dev` でローカルAPIサーバーを起動し、フロントエンドのdevサーバーと接続確認

## 最初に実装すべきタスク（優先順）

1. **チャットAPI (`/api/chat`)**
   - リクエスト: `{ messages: [...], provider: "anthropic" | "openai" | "ollama" | "workers-ai" }`
   - 内部でCloudflare AI Gatewayのエンドポイントにプロキシ
   - レスポンスはストリーミング対応（SSE推奨）

2. **MCP連携 (`/api/mcp-proxy`)**
   - LLMのtool call要求を受け取り、Astro Docs MCP Serverに中継
   - レスポンスをLLMに返してコード生成の根拠として利用させる

3. **フロントエンドのチャットパネル**
   - 既存のPlaygroundエディタ画面にサイドパネルとして追加
   - メッセージ履歴表示、プロバイダー選択ドロップダウン（Ollama含む）、送信ボタン

4. **生成コードの反映ロジック**
   - LLMが返すコード（ファイルパス+内容のペア想定）をWebContainerのファイルシステムに書き込む
   - プレビューが自動リロードされることを確認

5. **ローカル保存機能**
   - 「Export」ボタンでプロジェクト全体をzip化、またはFile System Access APIでローカルディスクに直接書き出す

## コーディング規約・注意点

- 言語: TypeScript優先。Workers側もTypeScriptで統一
- シークレット（APIキー等）は絶対にリポジトリにコミットしない。`.env` は `.gitignore` に含める
- OSS化を前提に、SaaS専用ロジック（課金、マルチユーザー管理）はPhase 1の時点で別ディレクトリ（`saas/`）に分離しておく
- Cloudflare AI GatewayのCustom Provider機能を使う際は、Ollama側がOpenAI互換の`/v1/chat/completions`を公開している前提で実装する（`LOCAL_LLM.md`参照）
- WebContainerの制約（ネイティブアドオン不可、長時間プロセス不可）を踏まえ、生成コードの実行可能性をチェックするバリデーションを入れる

## テスト・動作確認の指針
- 各プロバイダー（Anthropic/OpenAI/Workers AI/Ollama）で最低1回はチャット→コード生成→プレビュー反映のE2E確認を行う
- MCP接続が失敗した場合でもチャット機能自体は継続動作すること（グレースフルデグラデーション）を確認する
- ローカル保存機能は、生成ファイル数が多い場合（10ファイル以上等）でも正しく書き出せるか確認する

## Claude Codeへの依頼例（プロンプトサンプル）

```
ARCHITECTURE.md の Phase 1 構成に従い、
withastro/astro-playground をフォークしたこのリポジトリに
/api/chat エンドポイントを実装してください。
Cloudflare AI Gateway経由でAnthropic APIとOllama(http://localhost:11434)を
切り替えられるようにし、レスポンスはSSEでストリーミングしてください。
プロバイダー切替の詳細仕様は LOCAL_LLM.md を参照してください。
```

## 参照ドキュメント
- `CLAUDE.md`: プロジェクト全体のガイド
- `OVERVIEW.md`: プロダクト概要・要件
- `ARCHITECTURE.md`: システム構成の詳細
- `ROADMAP.md`: フェーズごとのタスクリスト
- `LOCAL_LLM.md`: ローカルLLM（Ollama）接続の仕様
