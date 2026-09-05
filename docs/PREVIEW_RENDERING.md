# プレビューレンダリング方式（browser / server）

Prestell UI の Preview は、ブラウザ内で WASM コンパイルした Astro コンポーネントを **2 通りのレンダラー**のどちらかで HTML 化する。
既定は `browser`（ブラウザ内 Web Worker）で、サーバー呼び出しなしに動作する。上流 Astro Playground と同じ `server`（Cloudflare Worker Loader）も選べる。

## 切替方法

```bash
pnpm dev             # browser（既定）
pnpm dev:server      # server（/api/render, Worker Loader）
# 環境変数で直接指定する場合
PUBLIC_PREVIEW_RENDERER=server pnpm dev
```

- 値は `astro.config.ts` が `PUBLIC_PREVIEW_RENDERER`（環境変数または `apps/playground/.env`）から読み、`__PREVIEW_RENDERER__` として注入する。不正な値はビルド時エラー。
- 現在のモードは出力ペイン右上のバッジ（`browser` / `server`）で確認できる。

## 実装（`apps/playground/src/lib`）

| ファイル | 役割 |
|---|---|
| `preview.ts` | `PreviewRenderer` インターフェース、`BrowserPreviewRenderer` / `ServerPreviewRenderer`、タイムアウト・キャンセルを担う `PreviewClient` |
| `preview-browser.worker.ts` | ブラウザ版。runtime / container のバンドル文字列と compiled component を Blob URL から `import()` し、`AstroContainer.renderToString` する |
| `preview-container.ts` / `preview-runtime.ts` | ブラウザ向けバンドルのエントリ（`astro.config.ts` が rolldown `platform: "browser"` で個別に 1 チャンクへ） |
| `preview-manifest.ts` | Container マニフェスト生成。両レンダラーで共用 |
| `preview-rewrite.ts` | compiled code の `from "./runtime.js"` を Blob URL に書き換える純関数 |
| `preview-worker.ts` + `pages/api/render.ts` | サーバー版（Worker Loader 上で実行） |

設計上のポイント:
- 生成コードの無限ループ等は `PREVIEW_TIMEOUT_MS`（既定 5 秒）で打ち切り、ブラウザ版は Worker を `terminate()` して次回再生成する（コンパイラ Worker と同じ復帰戦略）。
- `astro/container` は `new URL(相対, import.meta.url)` で `srcDir` 等を導出し、Blob URL 基準では失敗する。マニフェストで `srcDir` / `publicDir` / `outDir` / `buildClientDir` / `buildServerDir` / `cacheDir` を `file:///container/` 配下に固定して回避している。
- `Astro.request.url` は両モードとも `https://preview.astro.build/` に固定し、HTML が一致するようにしている。
- ブラウザ向けバンドルに `node:*` 依存が混入した場合は `astro.config.ts` がビルドを失敗させる（Astro 更新時の検知）。

## 構成比較

| 観点 | `server`: Worker Loader でサーバー側レンダリング | `browser`（既定）: Web Worker でブラウザ側レンダリング |
|---|---|---|
| コンパイル | ブラウザ内 WASM（共通） | ブラウザ内 WASM（共通） |
| レンダリング場所 | Cloudflare Workers 上の動的 Worker（`/api/render`） | ユーザーのブラウザ内 Web Worker |
| ネットワーク往復 | 編集ごとに 1 リクエスト | なし |
| 体感速度 | 数十〜数百 ms（往復 + Worker 起動） | 初回 ~30 ms、以降 2〜4 ms |
| 必要なホスティング | Cloudflare **Workers Paid**（Worker Loader が Free 不可） | 任意の静的ホスティング（Cloudflare Pages / GitHub Pages 等）の無料枠 |
| 固定費 | 月額 5 ドル〜 | 0 |
| 変動費 | 動的 Worker $0.002/ユニーク/日（beta 中は免除）+ リクエスト/CPU | 0（配信帯域のみ） |
| 初回ロード | 軽い | +約 690 KB（非圧縮。gzip で 150〜200 KB 想定、以後キャッシュ） |
| 生成コードの実行場所 | Cloudflare の隔離サンドボックス（`globalOutbound: null` で通信遮断済み） | ユーザーのブラウザ。**同一オリジンなら fetch / indexedDB に到達可能** |
| 悪意あるコードの影響範囲 | Cloudflare 側で完結、ユーザー環境に影響なし | 対策なしだとアプリのオリジン権限で動く → 別オリジン + CSP が必須 |
| オフライン動作 | 不可 | LLM を除けば可能（ローカル LLM と組み合わせれば完全オフライン） |
| `/api/chat` 等の AI 機能 | Workers 上 | 変わらず Workers（または別サーバー）が必要。静的部分と API を分離配信 |
| 複数ファイル対応 | Worker Loader の `modules` に同梱 | Blob モジュール間 import（同等の実現が可能な見込み） |
| Astro バージョン更新の影響 | `nodejs_compat` があるため耐性が高い | `node:*` 依存が入ると壊れる → CI でバンドル検証が必要 |
| 実装の変更量 | なし | `PreviewClient` の差し替えと `astro.config.ts` のバンドル生成変更（`/api/render` は削除またはフォールバック） |

### SaaS として公開する場合の注意点

**`server` を採る場合**
- Workers Paid が前提。beta 終了後は編集ごとに新しい動的 Worker が作られるため、`$0.002/ユニーク Worker/日` がユーザー数 × 編集回数で積み上がる。デバウンス延長、手動レンダリング（Auto OFF）の既定化、同一コードのハッシュキャッシュで回数を抑える。
- レンダリングはユーザーごとにリソースを消費するので、レートリミット（Durable Objects か KV でユーザー単位）とクレジット消費への紐付けが必要。
- 生成コードは Cloudflare 側で実行されるため、ユーザー環境への被害はないが、無限ループや巨大出力への CPU 時間・サイズ上限は現行どおり必須（既に 1 MB 上限と 5 秒タイムアウトあり）。

**`browser` を採る場合**
- **別オリジンのサンドボックス**が必須。プレビュー専用のサブドメイン（例: `preview.example.com`）を静的配信し、そこに `sandbox="allow-scripts"` の iframe を置いて中で Worker を起こす。メインアプリのセッション Cookie や localStorage には届かない。
- プレビューオリジンには CSP を付ける（`default-src 'none'; script-src 'self' blob:; worker-src 'self' blob:; connect-src 'none'`）。Worker スクリプト自身の応答ヘッダーにも同じ CSP が必要（ドキュメントの CSP は専用 Worker に継承されない）。
- 生成コードがユーザー自身のブラウザで動くだけなので運営側のコストと責任は小さいが、**他ユーザーが共有した作品を開くケース**では XSS 相当のリスクになる。共有機能を付けるなら上記サンドボックスが唯一の防壁になる点を設計上明記する。
- `Astro.request` はダミー URL を固定し、環境依存の値をプレビュー結果に混ぜない。
- AI 機能（LLM 呼び出し、BYOK キー管理、MCP プロキシ）は引き続きサーバー側に残るため、「静的フロント + API Worker」の 2 系統になる。API 側は Workers Free でも足りる可能性が高い（Worker Loader を使わないため）。
- 初回ロードが約 700 KB 増えるので、`runtime.js` / `container.js` は長期キャッシュ + ハッシュ付きファイル名で配信する。

**共通**
- ローカル LLM（Ollama / LM Studio）は運営サーバーから到達できないため、SaaS 版では提供できない。OSS 版限定の機能として切り分ける（`LOCAL_LLM.md`）。
- Astro Docs MCP は運営側 Worker から呼ぶため、ユーザー数に応じた呼び出し回数の上限（kapa.ai のレート）を確認する。


### 方針
- Phase 1〜3（個人利用・OSS）: `browser` 既定。生成コードは自分のブラウザで動くだけなのでリスクは受容範囲。
- Phase 4（静的ホスト版）: `browser` のまま、プレビュー用の別オリジン + sandbox iframe + CSP で隔離する。
- Phase 5 以降（SaaS）: 隔離実行や課金連動が必要な機能では `server` を選べる。`PreviewRenderer` のインターフェースを保つことで切替コストを抑える。

## 検証記録（2026-09-06）

スパイク（削除済み）で確認した結果の要約。

| 項目 | 結果 |
|---|---|
| ブラウザ向けバンドル | runtime 約 247 KB、container 約 439 KB（非圧縮）。`node:*` の import は出現せず |
| サンプル (a) frontmatter + scoped style + hoisted script | Worker で描画成功、サーバー版と HTML 完全一致 |
| サンプル (b) `Astro.props` 既定値 + `<slot />` + `class:list` | 成功、HTML 完全一致 |
| サンプル (c) `Astro.request.url` / `set:html` / `Fragment` | 成功。差分は Request URL のホストのみ（本実装では固定して解消） |
| 所要時間（Chrome 148, Apple Silicon） | 初回 27〜31 ms、2 回目以降 2〜4 ms |
| 権限プローブ | Worker から `fetch` 成功、`indexedDB` 参照可、`localStorage` なし → 公開時は別オリジン + CSP が必要 |
| 本実装後の確認 | browser / server 両モードで描画、`import` 非対応表示、無限ループのタイムアウトと復帰、本番ビルド（Worker チャンク約 672 KB）を確認 |
