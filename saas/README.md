# saas/

SaaS 運営専用ロジック（課金、マルチユーザー管理、Durable Objects / R2 連携など）の **境界を示すプレースホルダー**です。実装はここには置きません。

- 実装先: private リポジトリ `https://github.com/c-tomioka/prestell-ui-saas`（Phase 5 以降）
- `apps/` と `packages/` はこのディレクトリと private リポジトリを参照しません
- 公開範囲・境界ルール・拡張点（`ProjectStore`、プロバイダー層、`PreviewRenderer`）は `docs/OSS_SCOPE.md` を参照
