# EVALUATION.md

LLM の生成品質と、Astro Docs MCP（docsMode）がハルシネーションを減らすかを、固定のプロンプト集で機械的に採点する評価ハーネス。ROADMAP Phase 2 の「複数 LLM での生成品質を比較検証」「MCP 経由の Astro 知識活用がハルシネーションを減らしているか検証」に対応する。記録は `docs/evaluations/<日付>.md`（ハーネスが自動生成）。

## 実行方法

```bash
pnpm dev                 # dev サーバー（http://localhost:4321）を起動しておく
ollama serve             # ローカルモデルも比較する場合（起動中のモデルを自動検出）
pnpm eval                # 既定: Claude Haiku 4.5 + Workers AI 2 種 + 検出したローカルモデル、docsMode off/inject/tools
```

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `EVAL_BASE_URL` | `http://localhost:4321` | dev サーバー |
| `EVAL_MODELS` | `anthropic:claude-haiku-4.5,workers-ai:@cf/meta/llama-4-scout-17b-16e-instruct,workers-ai:@cf/qwen/qwen2.5-coder-32b-instruct` | `provider:model` のカンマ区切り。空文字にするとローカルモデルだけ |
| `EVAL_DOCS_MODES` | `off,inject,tools` | 比較する docsMode |
| `EVAL_CASES` | （全件） | ケース id のカンマ区切りで絞り込み |
| `EVAL_DATE` | 今日 | 出力ファイル名。同じ日付は上書き |
| `EVAL_MERGE` | （なし） | `1` で同じ日付の記録に (モデル, docsMode, ケース) 単位でマージする。通信失敗の結果は既存の実結果を上書きしない |

実体は `apps/playground/scripts/eval/eval.test.ts`（Vitest。`PRESTELL_EVAL=1` のときだけ動き、通常の `pnpm test` ではスキップ）。Vitest を使うのは、`validatePreview` などリポジトリ内モジュールの拡張子なし import を Vite に解決させるため。生の結果は `apps/playground/.eval/<日付>.json`（git 管理外）。

## 何を測るか

### コード生成（`scripts/eval/cases.ts` の `CODE_CASES`、8 件）
プロンプトテンプレート（Card / Hero / Pricing / Navbar / Contact form / Landing）のプレースホルダーを埋めたものと、既定コンポーネントへのスタイル調整 2 件（responsive / dark mode）。返答から ```astro ブロックを取り出し（`extractAstroCode`）、チャットパネルと同じ検証（コンパイラ診断 + `validatePreview`）にかける。不合格なら `buildFixPrompt` で最大 2 回再送し、fix ループの効果も測る。

| 指標 | 意味 |
|---|---|
| fence | ```astro ブロックがあった（プロースだけの返答は不合格） |
| pass@0 | 初回の返答が検証に合格 |
| pass@fix | fix ループ後に合格 |
| 平均 fix | 使った fix 回数 |
| 非対応 | import / client:* / 外部 script などプレビュー非対応構文で最終的に落ちた件数 |
| 通信失敗 | HTTP エラー・ストリーム中の error チャンク・タイムアウト |

### Astro 知識問答（`KNOWLEDGE_CASES`、8 件）
Astro 5 で変わった、または間違えやすい API を問う。`must`（正解に含まれるべき語）がすべて含まれ、`mustNot`（削除済み / 存在しない API）に一致しなければ correct。`mustNot` に 1 つでも一致すれば hallucinated。

| ケース | must | mustNot |
|---|---|---|
| view-transitions | `ClientRouter`, `astro:transitions` | `<ViewTransitions` |
| content-collections | `getCollection`, `astro:content`, `glob(` / `loader` | `Astro.glob(` |
| prerender | `prerender = false` | `output: 'hybrid'` |
| env | `astro:env`, `envField` | — |
| server-islands | `server:defer` | `client:defer` |
| class-list | `class:list` | — |
| named-slots | `<slot name=`, `slot="` | 「Astro.slots.render を使わなければならない」 |
| props-typing | `interface Props` / `type Props`, `Astro.props` | `defineProps(` |

## 既知の限界
- 採点は正規表現。言い回しの違いで「欠落」になることがある（不正解の明細に抜粋を出すので目視で補正する）。
- 各ケース 1 回のサンプル。モデルの揺らぎは平均していない。
- 知識問答も通常の system prompt（「1 つのコンポーネントを編集する」枠）付きで送る。質問文の先頭に「一般的な Astro の質問」と明記して枠から外しているが、製品の実挙動を測る設計であり、素のモデル評価ではない。
- `tools` モードの tool 呼び出し回数は `tool-input-available` チャンクの数。ローカルモデルが tool calling に対応しない場合は通信失敗や 0 回として現れる。

## 所見（2026-09-06）

対象: Claude Haiku 4.5（AI Gateway 経由、BYOK）、Workers AI の llama-4-scout-17b-16e-instruct と qwen2.5-coder-32b-instruct。Ollama は実行時に未起動だったため未測定。詳細は `docs/evaluations/2026-09-06.md`。

### コード生成
| モデル | off | inject | tools |
|---|---|---|---|
| Claude Haiku 4.5 | 8/8 | 8/8 | 7/8（navbar がプロースのみでコードなし） |
| llama-4-scout | 8/8 | 7/8（landing が fix 2 回でも不合格） | 6/8（1 回目の実行。pricing / navbar が `Unexpected token`） |
| qwen2.5-coder-32b | 7/8（pricing） | 7/8（pricing） | 測定不可（レート制限） |

- どの行も pass@0 = pass@fix で、**fix ループが不合格を合格に変えた例は 0 件**だった。fix 依頼は使われている（平均 0.25〜0.5 回）が、`Unexpected token (line N)` のような診断だけでは小型モデルは直せていない。次の改善候補は fix 依頼に該当行の本文を添えること（2026-09-07 に反映。`formatCompilerErrors` が `(line N)` の下に該当行を添える。効果は次回の評価で確認する）。今回の実行から生成コードを生の JSON に残すようにしたので、次回は原因を特定できる。
- Haiku は tools モードで 1 件だけコードブロックを返さなかった（検索結果の説明で終わった）。コード生成では inject の方が安定している。
- llama-4-scout の tools 列は 1 回目の実行の値。再実行が Workers AI の日次無料枠（レート制限 429）に当たり、当時のマージ処理が失敗結果で上書きしたため、記録ファイル上は通信失敗になっている（マージは通信失敗で実結果を上書きしないよう修正済み）。無料枠が戻ったら `EVAL_MERGE=1 EVAL_DOCS_MODES=tools EVAL_MODELS="workers-ai:@cf/meta/llama-4-scout-17b-16e-instruct,workers-ai:@cf/qwen/qwen2.5-coder-32b-instruct" pnpm eval` で埋め直す。

### Astro 知識問答（8 問、正答率 / ハルシネーション件数）
| モデル | off | inject | tools |
|---|---|---|---|
| Claude Haiku 4.5 | 38% / 2 | 88% / 0 | 100% / 0（tool 呼び出し 10 回） |
| llama-4-scout | 38% / 1 | 75% / 0 | 50% / 1（1 回目の実行。tool 呼び出し 0 回） |
| qwen2.5-coder-32b | 25% / 2 | 63% / 0 | 測定不可（レート制限） |

- **inject は 3 モデルすべてでハルシネーションを 0 にし、正答率を 2〜2.5 倍にした。** off で出た誤りは `<ViewTransitions />`（Astro 5 で `ClientRouter` に置換）、`output: 'hybrid'`（廃止）、`Astro.glob()`（非推奨）と、いずれも「学習時点の古い API」。
- tools が inject を上回るのはモデルが実際に検索を呼ぶ場合だけ。Haiku は 8 問で 10 回検索して全問正解、llama-4-scout は 1 回も呼ばず off とほぼ同じ結果になった。**既定は inject、Claude 系では tools** が妥当（2026-09-07 に既定を inject へ変更済み。保存済みの `off` も移行する）。
- inject でも残る誤答は `class:list`（式で書く一般解を返す）、`prerender = false`（`server:defer` や `server` ディレクティブと混同）、content collections の `glob()` ローダー（Astro 4 の `type: 'content'` 形式）。検索上位に該当ページが入らないケースで、質問文の言い換えか `maxHits` の調整で改善余地がある。

### 評価で見つかり、修正した不具合
1. **出力トークン上限の未指定**。`streamText` に `maxOutputTokens` がなく、Workers AI の既定（256 トークン）でコンポーネントが `<style>` の途中で切れていた。切れた提案は「Expected `>` but found `{`」としてコンパイル拒否され、モデルの問題に見えていた。`MAX_OUTPUT_TOKENS = 4096` を設定し、閉じフェンスのない返答はチャットパネルで「出力上限で途切れた」と表示して auto-fix しないようにした。
2. **Workers AI（qwen）が末尾の usage チャンクで `delta.content` に boolean を流す**。AI SDK のスキーマ検証で失敗しストリーム全体がエラーになっていた。`sanitizingFetch` で空文字に正規化。
3. **ハーネス側**: 同一プロバイダーの 2 モデルを並列に走らせると Workers AI のレート制限に当たる。プロバイダー内は直列に変更。

### 未実施・次回
- Ollama（qwen2.5-coder:7b 等）: `ollama serve` 後に `EVAL_MERGE=1 EVAL_MODELS= pnpm eval`（`EVAL_MODELS` を空にするとローカルのみ）。
- GPT-5 mini / Gemini 2.5 Flash: `EVAL_MERGE=1 EVAL_MODELS="openai:gpt-5-mini,google:gemini-2.5-flash" pnpm eval`。
- Workers AI の tools 列（上記）。
