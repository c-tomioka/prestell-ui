# LOCAL_LLM.md

ローカルLLM（Ollama等）をCloudflare AI Gateway経由で組み込むための設計仕様。

## 目的
- APIキー・外部通信不要で完全ローカルに動作するモードを提供する
- 外部LLM（Claude, GPT, Gemini等）とローカルLLMをUI上で同一インターフェースから切替可能にする
- 個人利用時のAPIコストをゼロにする選択肢を常に用意する

## 前提: Ollamaのセットアップ
- Ollamaはデフォルトで `http://localhost:11434` でHTTPサーバーを起動する
- OpenAI互換エンドポイント `http://localhost:11434/v1/chat/completions` を提供している
- 事前に `ollama pull <model名>`（例: `qwen2.5-coder`, `deepseek-coder-v2` 等コード生成向けモデル）でモデルを取得しておく

## Cloudflare AI Gatewayとの接続方式
Cloudflare AI GatewayのCustom Providers機能を使い、Ollamaを一つのプロバイダーとして登録する。

- Custom Provider名: `ollama-local`
- Base URL: `${OLLAMA_BASE_URL}`（環境変数、デフォルト `http://localhost:11434/v1`）
- 認証: 不要（ローカル通信のため）、Gateway側では空文字またはダミートークンを設定

Workers側の `/api/chat` は `provider` パラメータに応じてAI Gatewayへのリクエスト先を切り替える。

```
provider: "anthropic"   → AI Gateway → Anthropic API（BYOKキー使用）
provider: "openai"      → AI Gateway → OpenAI API（BYOKキー使用）
provider: "workers-ai"  → AI Gateway → Cloudflare Workers AI（無料枠）
provider: "ollama"      → AI Gateway → Custom Provider "ollama-local"
```

## フロントエンドのプロバイダー選択UI
- ドロップダウンで上記4種類（+将来追加分）を選択可能にする
- Ollama選択時は、事前に `GET http://localhost:11434/api/tags` 等でモデル一覧を取得し、利用可能なモデルをサブ選択させる
- Ollamaサーバーが起動していない場合は明確なエラーメッセージ（「Ollamaが起動していません。`ollama serve` を実行してください」等）を表示する

## MCP連携とローカルLLMの相性に関する注意
- ローカルLLM（特に小型モデル）はtool calling（MCP経由のドキュメント参照）の精度が外部の大型モデルより低い場合がある
- Astro Docs MCP Serverへの接続自体はプロバイダーに依存せず共通のロジックで行うが、ローカルモデル使用時はtool callingが機能しないケースを想定したフォールバック（プレーンなプロンプトへのドキュメント抜粋の埋め込み等）を検討する

## 環境変数一覧（ローカルLLM関連）
| 変数名 | 用途 | デフォルト |
|---|---|---|
| `OLLAMA_BASE_URL` | OllamaのOpenAI互換エンドポイント | `http://localhost:11434/v1` |
| `OLLAMA_DEFAULT_MODEL` | デフォルトで使用するローカルモデル名 | 未設定（UI側で選択必須） |

## 将来的な拡張（Phase 4以降を見据えて）
- SaaS化時、ユーザー側のローカルOllamaに運営サーバーから直接接続することはできない（ネットワーク的に不可能）ため、SaaS版では常に外部LLM/Workers AIのみを提供し、Ollama対応はOSS版（ローカル実行版）限定の機能として明確に区別する
