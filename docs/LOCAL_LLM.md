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
                       → Worker → AI Gateway REST API …/accounts/{account_id}/ai/v1/chat/completions
                         （旧形式 ${CF_AI_GATEWAY_URL}/compat/chat/completions も可）
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

## Cloudflare AI Gateway（外部 LLM）の接続仕様

`apps/playground/src/server/ai/providers.ts` の `gatewayConfig()` が `.dev.vars` から接続方式を決める。

| 設定 | 経路 | 認証 | 用途 |
|---|---|---|---|
| `CF_AI_GATEWAY_URL` が `api.cloudflare.com/client/v4/accounts/{id}/ai…`（REST、現行） | `…/ai/v1/chat/completions` | `Authorization: Bearer CF_AI_GATEWAY_TOKEN`、`cf-aig-gateway-id: CF_AI_GATEWAY_ID` | Workers AI と、Gateway 側に BYOK 保存済み / Unified Billing 残高のある外部モデル |
| REST URL + `.dev.vars` に `ANTHROPIC_API_KEY` 等がある | 自動で旧 compat `gateway.ai.cloudflare.com/v1/{id}/{gateway}/compat` | `cf-aig-authorization: Bearer CF_AI_GATEWAY_TOKEN` + `Authorization: Bearer <プロバイダーキー>` | ローカルのキーをそのまま使う BYOK パススルー（実測で Anthropic まで到達） |
| `CF_AI_GATEWAY_URL` が `gateway.ai.cloudflare.com/v1/…`（旧形式） | compat | 同上 | 既存設定との互換 |

- モデル ID は REST カタログ表記で指定する（`anthropic/claude-sonnet-4.5`、`anthropic/claude-opus-5`、`google/gemini-3-flash`、`openai/gpt-5.2`、Workers AI は `@cf/…`）。Anthropic は compat 経路ではハイフン表記（`claude-sonnet-4-5`）に自動変換する。
- 実測（2026-09-06）:
  - Workers AI `@cf/meta/llama-4-scout-17b-16e-instruct`: ストリーミング、`docsMode: tools`（`search_astro_docs` 呼び出し → 結果を踏まえた回答）まで動作。`@cf/meta/llama-3.3-70b-instruct-fp8-fast` はストリーミング可だが tool 結果の送り返しで 400。`@cf/moonshotai/kimi-k2.6` は 403（プリペイドクレジットが必要）。
  - Workers AI は `delta.content` を数値で返すチャンクを混ぜることがあるため、`sanitizingFetch()` で文字列化してから AI SDK に渡している。
  - REST で第三者モデルを呼ぶには Gateway 側の残高か BYOK 保存キーが必要（無いと 402）。`.dev.vars` のキーは REST には渡らないため、上記のパススルーで compat に切り替える。
  - Anthropic のキーが有効でも Anthropic アカウント側の残高が無いと「credit balance is too low」で失敗する（Cloudflare 側の問題ではない）。

## 環境変数一覧（ローカル LLM 関連, `apps/playground/.dev.vars`）
| 変数名 | 用途 | デフォルト |
|---|---|---|
| `OLLAMA_BASE_URL` | Ollama の OpenAI 互換エンドポイント | `http://localhost:11434/v1` |
| `LMSTUDIO_BASE_URL` | LM Studio の OpenAI 互換エンドポイント | `http://localhost:1234/v1` |

## 将来的な拡張（Phase 4 以降を見据えて）

- Phase 4 の静的ホスト版では、ブラウザから Ollama / LM Studio を直接呼ぶ「AI direct モード」を追加する（ローカル側で CORS 許可が必要: `OLLAMA_ORIGINS`、`lms server start --cors`）。
- SaaS 化時、ユーザー側のローカル Ollama に運営サーバーから直接接続することはできない（ネットワーク的に不可能）ため、SaaS 版では常に外部 LLM / Workers AI のみを提供し、ローカル LLM 対応は OSS 版（ローカル実行版）限定の機能として明確に区別する
- どうしてもローカルモデルを AI Gateway のログに載せたい場合は `cloudflared tunnel` で HTTPS 公開して Custom Provider に登録する手もあるが、個人利用では推奨しない
