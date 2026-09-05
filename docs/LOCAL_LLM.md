# LOCAL_LLM.md

ローカル LLM（Ollama / LM Studio）を組み込むための設計仕様。

## 目的
- API キー・外部通信不要で完全ローカルに動作するモードを提供する
- 外部 LLM（Claude, GPT, Gemini, Workers AI）とローカル LLM を UI 上で同一インターフェースから切替可能にする
- 個人利用時の API コストをゼロにする選択肢を常に用意する

## 接続方式（重要: AI Gateway は経由しない）

Cloudflare AI Gateway の Custom Providers は **base URL が HTTPS 必須**のため、`http://localhost:11434` の Ollama を登録できない。
そのため Phase 1 では **Worker（`astro dev` の workerd）からローカルサーバーへ直接 fetch** する。ブラウザから直接叩かないので、Ollama / LM Studio 側の CORS 設定は不要。

```
provider: "ollama"     → Worker → ${OLLAMA_BASE_URL}/chat/completions   (既定 http://localhost:11434/v1)
provider: "lmstudio"   → Worker → ${LMSTUDIO_BASE_URL}/chat/completions (既定 http://localhost:1234/v1)
provider: "anthropic" / "openai" / "google" / "workers-ai"
                       → Worker → AI Gateway ${CF_AI_GATEWAY_URL}/compat/chat/completions
```

すべて OpenAI 互換 `/chat/completions` なので、実装は `@ai-sdk/openai-compatible` 1本（`apps/playground/src/server/ai/providers.ts`）。

## 前提: ローカルサーバーのセットアップ

### Ollama
- `ollama serve` で `http://localhost:11434` に起動（OpenAI 互換: `/v1/chat/completions`, `/v1/models`）
- 事前に `ollama pull <model>`（例: `qwen2.5-coder:7b`, `qwen2.5-coder:1.5b` など）
- ストリーミング・tool calling（`tools`）対応。`tool_choice` は未対応

### LM Studio
- アプリの Developer タブ → Start Server（既定 `http://localhost:1234/v1`）、または同梱 CLI で `lms server start --port 1234`
  - CLI は `/Applications/LM Studio.app/Contents/Resources/app/.webpack/lms`。`lms bootstrap` で `~/.lmstudio/bin` に入る
  - モデル取得は `lms get <owner/model> -y`、ロードは `lms load <model> -y`、確認は `lms ls` / `lms ps`
- `/v1/models` にはダウンロード済みモデル（埋め込みモデル含む）が列挙される。モデル ID は LM Studio の識別子（例: `google/gemma-4-e4b`）
- JIT ロードが有効なら未ロードのモデルでも初回リクエストで自動ロードされる（初回応答が遅くなる）
- tool use 対応モデルなら `tools` も使える。CORS は不要（Worker 経由のため）。ブラウザ直結モードを試す場合のみ `lms server start --cors`
- 実機確認済み: LM Studio 0.3.31 + `google/gemma-4-e4b` で「生成 → 検証 → 適用 → Preview」が動作

## フロントエンドのプロバイダー選択 UI
- チャットパネルのドロップダウンでプロバイダーを選択。未設定（AI Gateway 未構成）のプロバイダーは選択不可で理由を表示
- ローカルプロバイダー選択時は `GET /api/models?provider=ollama|lmstudio` が `/v1/models` を中継し、モデル候補（datalist）を出す
- サーバー未起動・モデルなしの場合は「`ollama serve` を実行してください」「モデルをロードしてください」等のヒントを表示
- モデル ID は自由入力も可能（候補にない ID を指定できる）

## MCP 連携とローカル LLM の相性
- ローカル（特に小型）モデルは tool calling の精度が低いため、`docsMode` を3段階で切替可能にしている
  - `off`: ドキュメント参照なし
  - `inject`: 直近のユーザー発話で `search_astro_docs` を先に1回実行し、上位数件を system prompt に埋め込む（ローカルモデル推奨）
  - `tools`: MCP tools を `streamText` に渡し、モデル自身が検索する（クラウドモデル推奨）
- MCP 接続失敗時はドキュメントなしでチャットを継続する

## 環境変数一覧（ローカル LLM 関連, `apps/playground/.dev.vars`）
| 変数名 | 用途 | デフォルト |
|---|---|---|
| `OLLAMA_BASE_URL` | Ollama の OpenAI 互換エンドポイント | `http://localhost:11434/v1` |
| `LMSTUDIO_BASE_URL` | LM Studio の OpenAI 互換エンドポイント | `http://localhost:1234/v1` |

## 将来的な拡張（Phase 4 以降を見据えて）
- SaaS 化時、ユーザー側のローカル Ollama に運営サーバーから直接接続することはできない（ネットワーク的に不可能）ため、SaaS 版では常に外部 LLM / Workers AI のみを提供し、ローカル LLM 対応は OSS 版（ローカル実行版）限定の機能として明確に区別する
- どうしてもローカルモデルを AI Gateway のログに載せたい場合は `cloudflared tunnel` で HTTPS 公開して Custom Provider に登録する手もあるが、個人利用では推奨しない
