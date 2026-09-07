# OSS_SCOPE.md

Phase 3「OSS 公開」で確定した **公開範囲と SaaS 専用ロジックの境界**、および **シークレット管理の点検記録**。ROADMAP Phase 3 の最初の 2 項目に対応する（2026-09-07 確定）。

## 公開範囲（このリポジトリ = 公開リポジトリ）

このリポジトリで git 追跡しているものは **すべて公開対象**（Apache License 2.0、上流由来部分は MIT。`LICENSE.txt` / `NOTICE` / `THIRD_PARTY_NOTICES.md`）。

| 領域 | パス | 内容 |
|---|---|---|
| フロントエンド | `apps/playground/src/components/**`, `src/lib/**`, `src/pages/index.astro` | エディタ（CodeMirror）、ブラウザ内コンパイル・プレビュー、AI チャットパネル、提案の検証・適用、fix ループ、プロジェクト管理（IndexedDB）、テンプレート |
| Workers 設定・ルート | `apps/playground/wrangler.jsonc`, `astro.config.ts`, `src/pages/api/{chat,models,mcp-proxy,render}.ts`, `relay/**` | `astro dev`（workerd）で動く API と、Astro docs 中継 Worker（`relay/wrangler.jsonc`）。どちらの設定も account_id・シークレットを含まない（中継の `vars` は MCP の URL と Origin 許可リストだけ） |
| MCP 接続ロジック | `apps/playground/src/server/ai/mcp.ts`, `src/lib/ai/resilience.ts` | Astro Docs MCP（Streamable HTTP）の接続、`tools` / `inject`、タイムアウト・リトライ・グレースフルデグラデーション |
| LOCAL_LLM 連携・プロバイダー層 | `apps/playground/src/server/ai/providers.ts`, `validate.ts`, `src/lib/ai/providers-catalog.ts`, `prompt.ts`, `direct/**` | Ollama / LM Studio 直結、Cloudflare AI Gateway（BYOK パススルー含む）、system prompt、ブラウザ直接呼び出し（direct モード） |
| 評価ハーネス | `apps/playground/scripts/eval/**`, `docs/evaluations/**` | `pnpm eval`（`EVALUATION.md`） |
| 言語サポート | `packages/lang-astro/**` | CodeMirror 用 Astro 言語（上流由来、MIT） |
| ドキュメント・開発補助 | `docs/**`, `README.md`, `.claude/`（CLAUDE.md, launch.json）, `biome.json`, `.vscode/extensions.json` | Claude Code 向けガイドも含めて公開する |

## 非公開範囲（private リポジトリ `prestell-ui-saas`）

SaaS 運営専用ロジックは **このリポジトリには置かず**、private リポジトリ `https://github.com/c-tomioka/prestell-ui-saas` に置く（Phase 7 以降）。

- 課金（Stripe on Workers、事前クレジット、使用量集計）
- マルチユーザー認証（Cloudflare Access / 独自 Auth）、ユーザー管理
- Durable Objects / R2 によるサーバー側の永続化
- GitHub App 経由の push
- account_id・Gateway 名・ドメイン等を含むデプロイ設定、運用ダッシュボード

このリポジトリの `saas/` は **境界を示すためのプレースホルダー**（README のみ）として残し、実装は置かない。

## 境界ルール

1. `apps/` と `packages/` は `saas/` や private リポジトリを **参照しない**（`.claude/CLAUDE.md`、`DEVELOPMENT.md` の規約）。
2. private 側が公開版を **依存として取り込む**方向にする。取り込み方式は Phase 7 着手時に決める（候補: git submodule / pnpm の git 依存 / npm 公開。ここでは決めない）。
3. private 側が差し替える前提の **拡張点**は公開側でインターフェースとして保つ:
   - `ProjectStore`（`apps/playground/src/lib/projects/types.ts`）: IndexedDB 実装 → Durable Objects 実装
   - プロバイダー層（`apps/playground/src/server/ai/providers.ts` の `resolveModel` 等、共有カタログは `src/lib/ai/providers-catalog.ts`）: ローカル LLM は OSS/ローカル専用、SaaS は外部 LLM / Workers AI のみ（`LOCAL_LLM.md`）。direct モード（`src/lib/ai/direct/*`）はブラウザ完結の BYOK で、SaaS 版では提供しない
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
| コミット author | 2026-09-07 に git filter-repo で全コミットを noreply（`100511940+c-tomioka@users.noreply.github.com`）へ書き換え済み。リポジトリローカルの `git config user.email` も noreply |
| gitleaks（2026-09-07、v8.30.1） | 全履歴 20 コミット（`gitleaks git`）と HEAD の `git archive` 展開 136 ファイル（`gitleaks dir`）ともに **no leaks found**。CI の `secrets` ジョブ（`gitleaks/gitleaks-action@v2`。各 push / PR に含まれるコミットを検査。全履歴の再検査は下の再点検コマンドで手動）と opt-in の `.githooks/pre-commit`（`gitleaks git --staged`）で継続的に検査 |

サーバーが読む環境変数（`.dev.vars`）:

| 変数 | 読み取り箇所 | 必須 |
|---|---|---|
| `OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL` | `src/server/ai/providers.ts` | 任意（既定 `http://localhost:11434/v1` / `http://localhost:1234/v1`） |
| `CF_AI_GATEWAY_URL` / `CF_AI_GATEWAY_TOKEN` | `src/server/ai/providers.ts` | 外部 LLM / Workers AI を使うときのみ |
| `CF_AI_GATEWAY_ID` | `src/server/ai/providers.ts` | Workers AI では必須、第三者モデルでは任意 |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` | `src/server/ai/providers.ts` | 任意（BYOK パススルー。空なら Gateway 側の設定） |
| `ASTRO_DOCS_MCP_URL` | `src/server/ai/mcp.ts` | 任意（既定 `https://mcp.docs.astro.build/mcp`） |

`.dev.vars` ではなく Vite の `.env` から読む変数: `PUBLIC_PREVIEW_RENDERER`（`astro.config.ts`）と `PUBLIC_DOCS_PROXY_URL`（direct モードの Astro docs 中継先。既定 `/api/mcp-proxy`。`src/lib/ai/direct/docs-proxy.ts`）。雛形は `apps/playground/.env.example`。どちらもシークレットではない。direct モードでユーザーが入力する API キーはブラウザの sessionStorage にだけ置かれ、サーバーにもリポジトリにも渡らない（`src/lib/ai/direct/keys.ts`）。

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
gitleaks git --no-banner --redact .                      # 全履歴（brew install gitleaks）
rm -rf /tmp/prestell-export && mkdir -p /tmp/prestell-export && git archive HEAD | tar -x -C /tmp/prestell-export && gitleaks dir --no-banner --redact /tmp/prestell-export
```

## 公開手順（Phase 3 項目 5）

可視性の切替（Settings → General → Danger Zone → Change visibility → Public）は **メンテナーがコンソールから手動で行う**。その前後にやることは次のとおり。

### 公開前（完了、2026-09-07）
- [x] 上記のシークレット点検と gitleaks（履歴・作業ツリー）で検出 0
- [x] CI に `secrets` ジョブ（gitleaks、push / PR のコミットを検査）を追加。opt-in の `.githooks/pre-commit` を同梱。全履歴は手元の `gitleaks git` で検査済み
- [x] README（EN / JA）に CI バッジ
- [x] PR マージ後のブランチ自動削除、Dependabot alerts を有効化（`gh api`）
- [x] `docs/`・スクリーンショット・`.claude/`・`docs/evaluations/` は公開前提で内容確認済み

### 公開直後（2026-09-07 に public 化。1〜8 は同日に gh / API で実施済み）
1. Settings → Code security → **Private vulnerability reporting** を有効化（`SECURITY.md` と Issue テンプレートの `security/advisories/new` 導線が前提）
2. 同ページで **Secret scanning** と **Push protection** を有効化（public では無料）
3. 同ページで **Dependabot security updates** を有効化（alerts は公開前に有効化済み）
4. Settings → Rules → Rulesets: `main` に「PR 経由のみ」「必須ステータスチェック `checks` と `secrets`」「force push 禁止」「削除禁止」。solo 運用でも自分の誤操作を防ぐ
5. Settings → Actions → General: fork からの PR のワークフロー実行は既定（外部コントリビューターは初回承認制）のままにする
6. 公開時点の `main` に `v0.1.0` タグと GitHub Release を作成（リリースノートは Phase 1〜3 の要約と、`ROADMAP.md` の Phase 4 予告）
7. `ROADMAP.md` の項目 5 を `[x]` にし、`.claude/CLAUDE.md` の「現在のフェーズ」を Phase 4 の準備に更新
8. `README.md` の Status 節を「公開済み」に更新

公開後の検証: `gh api repos/c-tomioka/prestell-ui -q '.security_and_analysis'` と `gh api repos/c-tomioka/prestell-ui/rulesets` で 1〜4 を確認し、fork からの PR で CI が動くことを 1 回確認する。
