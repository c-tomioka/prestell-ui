# OSS_SCOPE.md

Phase 3「OSS 公開」で確定した **公開範囲と SaaS 専用ロジックの境界**、および **シークレット管理の点検記録**。ROADMAP Phase 3 の最初の 2 項目に対応する（2026-09-07 確定）。

## 公開範囲（このリポジトリ = 公開リポジトリ）

このリポジトリで git 追跡しているものは **すべて公開対象**（Apache License 2.0、上流由来部分は MIT。`LICENSE.txt` / `NOTICE` / `THIRD_PARTY_NOTICES.md`）。

| 領域 | パス | 内容 |
|---|---|---|
| フロントエンド | `apps/playground/src/components/**`, `src/lib/**`, `src/pages/index.astro` | エディタ（CodeMirror）、ブラウザ内コンパイル・プレビュー、AI チャットパネル、提案の検証・適用、fix ループ、プロジェクト管理（IndexedDB）、テンプレート |
| Workers 設定・ルート | `apps/playground/wrangler.jsonc`, `astro.config.ts`, `src/pages/api/{chat,models,mcp-proxy,render}.ts` | `astro dev`（workerd）で動く API。`wrangler.jsonc` は `LOADER` バインディングと observability のみで、account_id 等は含まない |
| MCP 接続ロジック | `apps/playground/src/server/ai/mcp.ts`, `resilience.ts` | Astro Docs MCP（Streamable HTTP）の接続、`tools` / `inject`、タイムアウト・リトライ・グレースフルデグラデーション |
| LOCAL_LLM 連携・プロバイダー層 | `apps/playground/src/server/ai/providers.ts`, `prompt.ts`, `validate.ts` | Ollama / LM Studio 直結、Cloudflare AI Gateway（BYOK パススルー含む）、system prompt |
| 評価ハーネス | `apps/playground/scripts/eval/**`, `docs/evaluations/**` | `pnpm eval`（`EVALUATION.md`） |
| 言語サポート | `packages/lang-astro/**` | CodeMirror 用 Astro 言語（上流由来、MIT） |
| ドキュメント・開発補助 | `docs/**`, `README.md`, `.claude/`（CLAUDE.md, launch.json）, `biome.json`, `.vscode/extensions.json` | Claude Code 向けガイドも含めて公開する |

## 非公開範囲（private リポジトリ `prestell-ui-saas`）

SaaS 運営専用ロジックは **このリポジトリには置かず**、private リポジトリ `https://github.com/c-tomioka/prestell-ui-saas` に置く（Phase 5 以降）。

- 課金（Stripe on Workers、事前クレジット、使用量集計）
- マルチユーザー認証（Cloudflare Access / 独自 Auth）、ユーザー管理
- Durable Objects / R2 によるサーバー側の永続化
- GitHub App 経由の push
- account_id・Gateway 名・ドメイン等を含むデプロイ設定、運用ダッシュボード

このリポジトリの `saas/` は **境界を示すためのプレースホルダー**（README のみ）として残し、実装は置かない。

## 境界ルール

1. `apps/` と `packages/` は `saas/` や private リポジトリを **参照しない**（`.claude/CLAUDE.md`、`DEVELOPMENT.md` の規約）。
2. private 側が公開版を **依存として取り込む**方向にする。取り込み方式は Phase 5 着手時に決める（候補: git submodule / pnpm の git 依存 / npm 公開。ここでは決めない）。
3. private 側が差し替える前提の **拡張点**は公開側でインターフェースとして保つ:
   - `ProjectStore`（`apps/playground/src/lib/projects/types.ts`）: IndexedDB 実装 → Durable Objects 実装
   - プロバイダー層（`apps/playground/src/server/ai/providers.ts` の `resolveModel` 等）: ローカル LLM は OSS/ローカル専用、SaaS は外部 LLM / Workers AI のみ（`LOCAL_LLM.md`）
   - `PreviewRenderer`（`apps/playground/src/lib/preview.ts`）: browser（既定）/ server（Worker Loader）
4. 環境変数は `apps/playground/.dev.vars`（ローカル）と Workers Secrets（デプロイ）だけから読む。公開リポジトリ内のファイルに **値を書かない**。

## シークレット管理の点検記録（2026-09-07）

| 項目 | 結果 |
|---|---|
| `.dev.vars` / `.env` の ignore | `.gitignore` に `.dev.vars*`（`!.dev.vars.example`）と `.env` / `.env.*`（`!.env.example`）。`git check-ignore -v` で確認 |
| 追跡中の env 系ファイル | `.env.example`、`apps/playground/.dev.vars.example`、`apps/playground/.env.example`（非シークレット）、`apps/playground/wrangler.jsonc` のみ |
| 履歴で一度でも追跡されたか | `.dev.vars` / `.env` / `*.pem` / `*.key` → なし |
| 履歴内のキー文字列 | `sk-ant-` / `sk-` / `AIza` / `ghp_` / `github_pat_` / `Bearer <長い文字列>` / 32 桁 hex（account_id 形）→ なし |
| 追跡ファイル内の個人パス | `/Users/...` → なし |
| `wrangler.jsonc` | account_id / vars / secrets なし |
| `docs/evaluations/*.md` | トークン・account 情報なし |
| `.dev.vars.example` の網羅性 | サーバーが読む 9 変数をすべて含む（下表） |
| コミット author | 個人メールを公開前に noreply へ書き換える（別手順）。以後はリポジトリローカルの `git config user.email` を noreply に設定 |

サーバーが読む環境変数（`.dev.vars`）:

| 変数 | 読み取り箇所 | 必須 |
|---|---|---|
| `OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL` | `src/server/ai/providers.ts` | 任意（既定 `http://localhost:11434/v1` / `http://localhost:1234/v1`） |
| `CF_AI_GATEWAY_URL` / `CF_AI_GATEWAY_TOKEN` | `src/server/ai/providers.ts` | 外部 LLM / Workers AI を使うときのみ |
| `CF_AI_GATEWAY_ID` | `src/server/ai/providers.ts` | Workers AI では必須、第三者モデルでは任意 |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` | `src/server/ai/providers.ts` | 任意（BYOK パススルー。空なら Gateway 側の設定） |
| `ASTRO_DOCS_MCP_URL` | `src/server/ai/mcp.ts` | 任意（既定 `https://mcp.docs.astro.build/mcp`） |

`.dev.vars` ではなく Vite の `.env` から読む変数: `PUBLIC_PREVIEW_RENDERER`（`astro.config.ts`。雛形は `apps/playground/.env.example`）。シークレットではない。

注意: `astro build` は `.dev.vars` を `apps/playground/dist/server/` にコピーする。`dist/` は `.gitignore` 済みだが、**`dist/` を配布・zip・共有しない**。

### 再点検コマンド（リポジトリルートで実行）

```bash
git ls-files | grep -Ei '(\.env|dev\.vars|wrangler|secrets?)'
git check-ignore -v apps/playground/.dev.vars apps/playground/.env
git log --all --diff-filter=A --name-only --pretty=format: -- '*.dev.vars' '.env' '*/.env' '*.pem' '*.key' | sort -u
git log -p --all | grep -nE '(sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|Bearer [A-Za-z0-9_-]{30,})'
git log -p --all | grep -nE '\b[0-9a-f]{32}\b' | grep -viE '(sha|integrity|hash|lock|pnpm)'
git grep -nE '(/Users/|accounts/[0-9a-f]{32})' -- ':!pnpm-lock.yaml'
git log --format='%an <%ae>' | sort -u
```

### TODO（Phase 3 の残り項目で扱う）
- gitleaks 等のシークレットスキャンを pre-commit / CI に追加（public 化の前）
- CONTRIBUTING / SECURITY.md / `.github/` テンプレート、`package.json` の `license` フィールド
