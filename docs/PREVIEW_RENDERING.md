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
| `preview.ts` | `PreviewRenderer` インターフェース、`SandboxPreviewRenderer`（別オリジンのフレーム経由、既定）/ `BrowserPreviewRenderer` / `ServerPreviewRenderer`、`FallbackPreviewRenderer`（sandbox 不可時に同一オリジンへ）、タイムアウト・キャンセルを担う `PreviewClient` |
| `preview-sandbox-protocol.ts` | 親 ↔ フレームの postMessage 契約（`ready` / `render` / `cancel` / `result`）と、フレームのオリジン候補（`previewFrameOrigins`） |
| `preview-frame.ts` + `pages/preview/index.astro` | sandbox フレーム側。`BrowserPreviewRenderer` を動かし、親の要求を Worker に渡す |
| `preview-frame-csp.ts` | フレームの CSP（`public/_headers` と dev ミドルウェアで配信。テストで同期を確認） |
| `preview-browser.worker.ts` | ブラウザ版。runtime / container のバンドル文字列と compiled component を Blob URL から `import()` し、`AstroContainer.renderToString` する |
| `preview-container.ts` / `preview-runtime.ts` | ブラウザ向けバンドルのエントリ（`astro.config.ts` が rolldown `platform: "browser"` で個別に 1 チャンクへ） |
| `preview-manifest.ts` | Container マニフェスト生成（モジュールごとの `componentMetadata` と hoisted script）。両レンダラーで共用 |
| `preview-graph.ts` | 複数ファイルのモジュールグラフ（Phase 5）。入口 `.astro` の相対 import を解決し、到達する `.astro` を依存先から順にコンパイル、`.css` の import は本文を集めて import 文を削除、`.astro` の import は平坦なモジュール名（入口 = `component.js`、依存 = `module-<n>.js`）に書き換える。循環 import と解決できない import は `PreviewUnsupportedError` |
| `preview-rewrite.ts` | compiled code の先頭の import 文を検出・書き換える純関数（`./runtime.js` → Blob URL、`./module-<n>.js` → Blob URL、CSS import の削除） |
| `preview-worker.ts` + `pages/api/render.ts` | サーバー版（Worker Loader 上で実行） |
| `preview-assets.ts` | `public/` 配下のファイルを `data:` URL にし（Blob ごとにキャッシュ）、描画後の HTML / CSS の `/images/x.png`・`srcset`・`url()`・`<link rel="stylesheet">` を書き換える（Phase 5） |

設計上のポイント:
- **複数ファイル（Phase 5）**: レンダラーへの要求は `PreviewRenderRequest { modules }`（`preview-protocol.ts`）。`modules` は依存先から順に並んだコンパイル済みモジュールで、各モジュールの import は `./runtime.js` と `./module-<n>.js` だけになっている。browser 版は配列順に Blob URL を作りながら import を Blob URL に置換し（依存先の URL が先に確定する）、server 版はそのままの名前で Worker Loader の `modules` に同梱する（`component.js` を `preview-worker.ts` が静的に import）。CSS は要求に含めず、`buildPreviewGraph` が返す `css`（`.css` import → `is:global` → scoped の順、依存先が先）をアプリ側でプレビュー文書に注入する。Component モードは `allowImports: false` で従来どおり import を一切許さない。
- **`public/` の参照と外部画像（Phase 5）**: 表示用の srcdoc iframe は `sandbox="allow-scripts"` で opaque origin のため、アプリ側で作った `blob:` URL を読めない。そこで `public/` のファイルは `data:` URL にして参照を書き換える（`preview-assets.ts`、`createPreviewDocument(html, css, assets)`）。表示用 iframe の CSP（`preview.ts` の `PREVIEW_DOCUMENT_CSP`）は `img-src https: data: blob:` で、ページが外部画像（https のみ）を表示できる。`connect-src 'none'` とレンダリング Worker 側のフレーム CSP（`preview-frame-csp.ts`）は変更なし。
- **sandbox フレーム（Phase 4）**: ブラウザ版のレンダリング Worker は、アプリとは別オリジンから読み込んだ非表示 iframe（`/preview/`、`sandbox="allow-scripts allow-same-origin"`）の中で動く。別オリジンなのでアプリの IndexedDB（プロジェクト・チャット履歴）や localStorage には届かず、フレームの HTTP ヘッダー CSP（`default-src 'none'; script-src 'self' blob:; worker-src 'self' blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *`）を Worker も継承するので `fetch` も止まる。親 ↔ フレームは postMessage（`preview-sandbox-protocol.ts`）。表示用の srcdoc iframe（`sandbox="allow-scripts"` + meta CSP）は従来どおり親側。
- **フレームのオリジン**: `PUBLIC_PREVIEW_ORIGIN` があればそれ。無ければ dev サーバーで `localhost` / `127.0.0.1` / `[::1]` の残り 2 つを順に試す（同じサーバー・別オリジン。どれにバインドされるかは OS 依存なので、iframe の `load` 後 500 ms 以内に `ready` が来ない候補は捨てる）。全滅（本番で未設定など）なら `FallbackPreviewRenderer` が同一オリジンの Worker に切り替え、`console.warn` とバッジ「browser · not isolated」で明示する。
- **COEP との両立**: 親は `Cross-Origin-Embedder-Policy: credentialless` なので、別オリジンのフレーム応答には `Cross-Origin-Resource-Policy: cross-origin` と COEP が必要（`public/_headers` の `/*` と dev ミドルウェアで全応答に付与）。
- 生成コードの無限ループ等は `PREVIEW_TIMEOUT_MS`（既定 5 秒）で打ち切り、ブラウザ版は Worker を `terminate()` して次回再生成する（コンパイラ Worker と同じ復帰戦略）。sandbox ではタイムアウト時に親が `cancel` を送り、フレーム内の Worker が terminate される。
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
| 生成コードの実行場所 | Cloudflare の隔離サンドボックス（`globalOutbound: null` で通信遮断済み） | ユーザーのブラウザの、別オリジン sandbox フレーム内 Worker（Phase 4 で実装）。`connect-src 'none'` で fetch 不可、アプリの IndexedDB / localStorage に届かない。sandbox オリジンが無い場合だけ同一オリジンの Worker にフォールバック（バッジで明示） |
| 悪意あるコードの影響範囲 | Cloudflare 側で完結、ユーザー環境に影響なし | sandbox フレーム内で完結（フレーム自身の空のストレージのみ）。フォールバック時はアプリのオリジン権限で動くため、公開時は `PUBLIC_PREVIEW_ORIGIN` を必ず設定する |
| オフライン動作 | 不可 | LLM を除けば可能（ローカル LLM と組み合わせれば完全オフライン） |
| `/api/chat` 等の AI 機能 | Workers 上 | 変わらず Workers（または別サーバー）が必要。静的部分と API を分離配信 |
| 複数ファイル対応 | Worker Loader の `modules` に同梱（実装済み） | Blob モジュール間 import（実装済み。sandbox の CSP `script-src blob:` の範囲で動く） |
| Astro バージョン更新の影響 | `nodejs_compat` があるため耐性が高い | `node:*` 依存が入ると壊れる → CI でバンドル検証が必要 |
| 実装の変更量 | なし | `PreviewClient` の差し替えと `astro.config.ts` のバンドル生成変更（`/api/render` は削除またはフォールバック） |

### SaaS として公開する場合の注意点

**`server` を採る場合**
- Workers Paid が前提。beta 終了後は編集ごとに新しい動的 Worker が作られるため、`$0.002/ユニーク Worker/日` がユーザー数 × 編集回数で積み上がる。デバウンス延長、手動レンダリング（Auto OFF）の既定化、同一コードのハッシュキャッシュで回数を抑える。
- レンダリングはユーザーごとにリソースを消費するので、レートリミット（Durable Objects か KV でユーザー単位）とクレジット消費への紐付けが必要。
- 生成コードは Cloudflare 側で実行されるため、ユーザー環境への被害はないが、無限ループや巨大出力への CPU 時間・サイズ上限は現行どおり必須（既に 1 MB 上限と 5 秒タイムアウトあり）。

**`browser` を採る場合**
- **別オリジンのサンドボックス**が必須（実装済み。上の「設計上のポイント」）。同じビルドをプレビュー専用のオリジン（例: `preview.example.com`、または 2 つ目の Pages プロジェクト）にも配信し、アプリ側のビルドで `PUBLIC_PREVIEW_ORIGIN` にそのオリジンを指定する。メインアプリのセッション Cookie や localStorage、プロジェクト・チャット履歴を保持する IndexedDB には届かない（Phase 2 で保存先が IndexedDB になったため、この隔離の重要度が上がっている）。
- プレビューオリジンの `/preview/*` には CSP（`public/_headers`）が付く。Worker は Blob URL から起動するため文書の CSP を継承する（`worker-src blob:`）。
- 生成コードがユーザー自身のブラウザで動くだけなので運営側のコストと責任は小さいが、**他ユーザーが共有した作品を開くケース**では XSS 相当のリスクになる。共有機能を付けるなら上記サンドボックスが唯一の防壁になる点を設計上明記する。
- `Astro.request` はダミー URL を固定し、環境依存の値をプレビュー結果に混ぜない。
- AI 機能（LLM 呼び出し、BYOK キー管理、MCP プロキシ）は引き続きサーバー側に残るため、「静的フロント + API Worker」の 2 系統になる。API 側は Workers Free でも足りる可能性が高い（Worker Loader を使わないため）。
- 初回ロードが約 700 KB 増えるので、`runtime.js` / `container.js` は長期キャッシュ + ハッシュ付きファイル名で配信する。

**共通**
- ローカル LLM（Ollama / LM Studio）は運営サーバーから到達できないため、SaaS 版では提供できない。OSS 版限定の機能として切り分ける（`LOCAL_LLM.md`）。
- Astro Docs MCP は運営側 Worker から呼ぶため、ユーザー数に応じた呼び出し回数の上限（kapa.ai のレート）を確認する。


### 方針
- Phase 1〜3（個人利用・OSS）: `browser` 既定。生成コードは自分のブラウザで動くだけなのでリスクは受容範囲。
- Phase 4（静的ホスト版）: `browser` のまま、プレビュー用の別オリジン + sandbox iframe + CSP で隔離する（実装済み）。
- Phase 5（サイトビルダー）: `browser` のまま複数ファイルに対応する（相対 import を Blob URL のモジュールグラフに書き換え、`public/` の画像は blob: URL）。`server` は Worker Loader の `modules` に同梱。モジュールグラフは両レンダラーで実装済み（`preview-graph.ts`、下の検証記録）。
- Phase 7 以降（SaaS）: 隔離実行や課金連動が必要な機能では `server` を選べる。`PreviewRenderer` のインターフェースを保つことで切替コストを抑える。

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

## 検証記録（2026-09-07、sandbox フレーム）

dev サーバー（アプリ `http://localhost:4321`、フレームは候補 `127.0.0.1` が接続拒否 → `[::1]` を採用）で、frontmatter から権限を試すコンポーネントを描画した結果:

| プローブ | 結果 |
|---|---|
| `fetch("http://localhost:4321/api/models")`（アプリの API） | `TypeError: Failed to fetch`（CSP `connect-src 'none'`） |
| `fetch("https://example.com/")` | 同上 |
| `indexedDB.databases()` | `[]`（フレームのオリジン `http://[::1]:4321` の空のストレージ。アプリの `prestell` DB は見えない） |
| `self.origin` | `http://[::1]:4321` |
| `localStorage` | `undefined`（Worker） |
| `while (true)` の frontmatter | 5 秒で「Preview timed out after 5000ms.」。同じフレームのまま次の描画（New project）が成功 |
| バッジ | 「browser · sandboxed」。候補が全滅した場合は「browser · not isolated」（単体テストで確認） |
| ヘッダー | `/preview/` に CSP / COEP / CORP、`/` に CORP が付くこと（dev ミドルウェア、curl で確認）。本番は `public/_headers` |

dev での注意: Vite の開発サーバーは `Sec-Fetch-Site: cross-site` の `fetch` を 403 で拒否するため、候補の到達確認は fetch ではなく iframe の `load` イベントで行っている。`localhost` がどのループバックアドレスにバインドされるかは Node の名前解決次第（macOS では `::1` のみ）で、候補を順に試す理由でもある。

## 検証記録（2026-09-08、複数モジュール）

`src/pages/index.astro`（Layout と Card を import、`../styles/global.css` を import、`<style>` と `<script>` あり）+ `src/layouts/Layout.astro`（`<html><head>` と `<slot />`、`is:global` スタイル）+ `src/components/Card.astro`（scoped スタイル）の 3 ファイルを `buildPreviewGraph` でグラフ化し、両レンダラーに渡した結果:

| 項目 | 結果 |
|---|---|
| browser（sandbox フレーム `http://[::1]:4321/preview/`、CSP 適用） | `<html><head><title>` … `<main>` に slot の中身、Card 2 枚、末尾に page の hoisted `<script type="module">`。描画成功 |
| server（`POST /api/render`、Worker Loader の `modules` に `component.js` + `module-1.js` + `module-2.js`） | browser と **HTML 完全一致** |
| CSS | `global.css` → Layout の `is:global` → Card の scoped → page の scoped の順で 4 ブロック。scope ハッシュはファイルパスごとに異なる |
| 旧形式の要求（`{ code, … }`）/ 入口モジュールが無い要求 | `/api/render` が `The preview request is invalid.`（400） |
| 循環 import（a → b → a） | `Circular imports are not supported in Preview: a.astro → b.astro → a.astro`（単体テスト） |
| Component モード（`allowImports: false`） | 従来どおり `Imports are not supported in Preview: ./Card.astro` |
