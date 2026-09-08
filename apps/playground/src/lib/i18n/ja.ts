// Japanese UI strings. Keys mirror `en.ts` (the type makes a missing key a
// compile error). Product terms follow README.ja.md: 提案 / 適用 / 自動修正 / 中継.
import type { MessageKey } from "./en";

export const ja: Record<MessageKey, string> = {
	"locale.switchTo": "英語に切り替える",
	"locale.switchText": "EN",

	"toolbar.project": "プロジェクト",
	"toolbar.sourcemap": "sourcemap",
	"toolbar.compact": "compact",
	"toolbar.scopedStyle": "scoped style",
	"toolbar.showChat": "AI チャットを表示",
	"toolbar.hideChat": "AI チャットを隠す",
	"toolbar.switchToLight": "ライトモードに切り替え",
	"toolbar.switchToDark": "ダークモードに切り替え",
	"toolbar.save": "コンポーネントをファイルに保存",
	"toolbar.saved": "保存しました",
	"toolbar.downloaded": "ダウンロードしました",
	"toolbar.saveFailed": "保存に失敗しました",
	"toolbar.share": "共有リンクをコピー",
	"toolbar.copied": "コピーしました",
	"toolbar.copyFailed": "コピーに失敗しました",
	"toolbar.shareComponentOnly":
		"共有リンクは Component プロジェクトでのみ使えます",

	"project.new": "新しいプロジェクト",
	"project.rename": "プロジェクト名を変更",
	"project.delete": "プロジェクトを削除",
	"project.namePrompt": "プロジェクト名",
	"project.deleteConfirm":
		"プロジェクト「{name}」とそのチャット履歴を削除しますか？",
	"project.newTitle": "新しいプロジェクト…",
	"project.mode.component": "Component",
	"project.mode.component.hint": "自己完結した .astro ファイル 1 本",
	"project.mode.page": "Page",
	"project.mode.page.hint": "レイアウトとグローバル CSS を持つ index ページ",
	"project.mode.site": "Site",
	"project.mode.site.hint": "複数ページ・レイアウト・共有コンポーネント",
	"project.promote": "Page プロジェクトに変換",
	"project.promoteConfirm":
		"「{file}」を src/components/ に移し、レイアウト付きの新しい src/pages/index.astro から表示しますか？",
	"project.cancel": "キャンセル",

	"files.title": "ファイル",
	"files.collapse": "ファイルツリーを隠す",
	"files.expand": "ファイルツリーを表示",
	"files.add": "新しいファイル",
	"files.addPrompt": "ファイルのパス（例: src/components/Card.astro）",
	"files.rename": "ファイルの名前変更・移動",
	"files.renamePrompt": "{path} の新しいパス",
	"files.delete": "ファイルを削除",
	"files.deleteConfirm": "「{path}」を削除しますか？",
	"files.entryBadge": "入口",
	"files.entryTitle": "プレビューが描画するファイル",
	"files.binary": "バイナリファイル（ここでは編集できません）",
	"files.invalidPath":
		"英数字・ドット・ハイフン・アンダースコアからなる相対パスを指定してください（例: src/components/Card.astro）。",
	"files.componentPath":
		"Component プロジェクトはトップレベルの .astro ファイル 1 本だけを持ちます（例: Card.astro）。",
	"files.unsupportedType":
		"対応していない種類のファイルです。テキストファイルのみ: .astro, .css, .svg, .txt, .json, .xml, .html, .js, .webmanifest。",
	"files.outsideRoots": "ファイルは src/ か public/ の下に置いてください。",
	"files.astroOutsideSrc": ".astro ファイルは src/ の下に置いてください。",
	"files.exists": "「{path}」という名前のファイルは既にあります。",
	"files.cannotDeleteEntry":
		"「{path}」はプレビューの入口です。先に Preview の選択で別の入口を選んでください。",

	"editor.filename": "コンポーネントのファイル名",
	"editor.starting": "コンパイラを起動中…",
	"editor.compiling": "コンパイル中…",
	"editor.compilerError": "コンパイルエラー",
	"editor.compiledIn": "{ms} ms でコンパイル",
	"editor.resize": "エディタと出力ペインの幅を変更",
	"editor.tabs": "開いているファイル",
	"editor.closeTab": "{path} を閉じる",

	"tabs.preview": "プレビュー",
	"tabs.js": "JS",
	"tabs.css": "CSS",
	"tabs.scripts": "スクリプト",
	"tabs.metadata": "メタデータ",
	"tabs.diagnostics": "診断",
	"tabs.ast": "AST",
	"tabs.sourcemap": "ソースマップ",
	"output.tablist": "コンパイラ出力",
	"output.compiled": "コンパイル結果（読み取り専用）",
	"output.badge.server": "サーバー",
	"output.badge.sandboxed": "ブラウザ · 隔離済み",
	"output.badge.unisolated": "ブラウザ · 未隔離",
	"output.renderer.server":
		"サーバー側の /api/render（Cloudflare Worker Loader）で描画",
	"output.renderer.sandboxed":
		"別オリジンの sandbox フレーム内の Web Worker で描画（サーバー通信なし、このアプリのデータには届かない）",
	"output.renderer.unisolated":
		"このオリジンの Web Worker で描画: プレビュー用の別オリジン（PUBLIC_PREVIEW_ORIGIN）が未設定のため、生成コードはこのアプリから隔離されていません",
	"output.autoTitle": "編集のたびにプレビューを自動で描画",
	"output.auto": "自動",
	"output.renderNow": "今すぐプレビューを描画",
	"output.renderNowStale": "今すぐプレビューを描画（未反映の変更あり）",
	"output.stale": "変更が未反映",
	"output.staleBanner":
		"変更がプレビューに反映されていません。↻ を押すか「自動」をオンにしてください。",
	"output.frameTitle": "描画された Astro コンポーネント",
	"output.rendering": "プレビューを描画中…",
	"output.selectPreview": "プレビュータブを選ぶと描画します。",
	"output.scopeHash": "スコープハッシュ",
	"output.containsHead": "<head> を含む",
	"output.propagation": "Propagation",
	"output.hydrated": "ハイドレートされるコンポーネント",
	"output.clientOnly": "クライアント専用コンポーネント",
	"output.serverComponents": "サーバーコンポーネント",
	"output.styleErrors": "スタイルのエラー",
	"output.nothingCompiled": "まだコンパイルされていません。",
	"output.noDiagnostics": "診断はありません。",
	"output.entry": "ページ",
	"output.entryTitle": "プレビューが描画するファイル（ページを先頭に表示）",
	"output.notAstro":
		"コンパイラ出力を見るには .astro ファイルを選んでください。",

	"chat.title": "AI チャット",
	"chat.clear": "チャット履歴を消去",
	"chat.close": "チャットパネルを閉じる",
	"chat.autoApply": "有効な提案を自動で適用",
	"chat.autoFix": "エラーを自動修正（最大",
	"chat.autoFixAria": "自動修正の最大回数",
	"chat.tries": "回）",
	"chat.fallback": "フォールバック",
	"chat.fallbackAria": "失敗したときに提案するフォールバック先",
	"chat.none": "なし",
	"chat.docs": "Astro ドキュメント",
	"chat.docsOff": "使わない",
	"chat.docsInject": "inject（先に検索）",
	"chat.docsTools": "tools（ツール呼び出し）",
	"chat.retrying": "再試行中…",
	"chat.retry": "再試行",
	"chat.retryWith": "{provider} で再試行",
	"chat.dismiss": "閉じる",
	"chat.message": "メッセージ",
	"chat.placeholder":
		"作りたいコンポーネントや変更したい内容を書いてください…（⌘/Ctrl+Enter で送信）",
	"chat.stop": "生成を停止",
	"chat.send": "送信（⌘/Ctrl+Enter）",
	"chat.providersFailed": "プロバイダー一覧を取得できませんでした: {error}",
	"chat.truncated":
		"出力上限に達したため、コードブロックが閉じる前に返答が終わりました。小さいコンポーネントを頼むか、出力上限の大きいモデルを選んでください。",
	"chat.empty":
		"作りたいコンポーネントを書いてください。例:「3 プランの料金セクション。真ん中のプランを強調」。送信ボタンの隣のテンプレートも使えます。返答は Astro コンパイラで検証してからエディタに反映します。",
	"chat.you": "あなた",
	"chat.assistant": "アシスタント",
	"chat.fixRequest": "🔧 自動修正リクエスト {attempt}/{max}",
	"chat.thinking": "考え中…",
	"chat.multiFileNote":
		"チャットはアクティブなファイル（{path}）を 1 つのコンポーネントとして編集します。複数ファイルの同時生成は今後対応します。",

	"proposal.title": "コンポーネントの提案",
	"proposal.lines": "{count} 行",
	"proposal.generating": "生成中…",
	"proposal.validating": "検証中…",
	"proposal.ready": "適用できます",
	"proposal.applied": "エディタに適用済み",
	"proposal.cannotRender": "描画できません",
	"proposal.fixing": "描画できません · 自動修正中 {attempt}/{max}…",
	"proposal.retried": "描画できません · 再試行済み（{attempt}/{max}）",
	"proposal.gaveUp": "描画できません · 自動修正を断念（{attempt}/{max}）",
	"proposal.expand": "展開",
	"proposal.collapse": "折りたたむ",
	"proposal.apply": "適用",
	"proposal.applyAgain": "もう一度適用",
	"proposal.applyAnyway": "そのまま適用",

	"provider.connection": "接続",
	"provider.server": "サーバー（/api/chat）",
	"provider.direct": "ダイレクト（ブラウザ → プロバイダー、BYOK）",
	"provider.hint.server":
		"リクエストはこのアプリの /api/chat を経由します。プロバイダーのキーはサーバーの .dev.vars に置きます。",
	"provider.hint.direct":
		"リクエストはブラウザからプロバイダーへ直接送られます（自分のキーを使用）。API サーバーなしで動きます。",
	"provider.provider": "プロバイダー",
	"provider.notConfigured": "未設定",
	"provider.serverOnly": "サーバー専用",
	"provider.apiKey": "API キー",
	"provider.keyPlaceholder": "{provider} の API キーを貼り付け",
	"provider.forgetKeys": "このタブのキーをすべて削除",
	"provider.keyNote":
		"請求は自分のアカウントに紐づきます。キーはこのタブだけに保持され、他には保存されません。",
	"provider.keySaved": "このタブにキーを保存済み（…{tail}）。",
	"provider.keySavedShort": "このタブにキーを保存済み。",
	"provider.serverUrl": "サーバー URL",
	"provider.model": "モデル",
	"provider.loadingModels": "モデルを読み込み中…",
	"provider.modelPlaceholder": "モデル ID",
	"provider.reloadModels": "モデル一覧を再読み込み",

	"template.insert": "プロンプトテンプレートを挿入",
	"template.placeholder": "テンプレート…",
	"template.category.component": "コンポーネント",
	"template.category.layout": "レイアウト",
	"template.category.style": "スタイル",
	"template.card": "カード",
	"template.hero": "ヒーローセクション",
	"template.pricing": "料金セクション",
	"template.navbar": "ナビゲーションバー",
	"template.contact-form": "お問い合わせフォーム",
	"template.testimonials": "お客様の声",
	"template.feature-grid": "機能グリッド",
	"template.landing": "ランディングページ",
	"template.two-column": "2 カラムレイアウト",
	"template.dashboard": "ダッシュボードグリッド",
	"template.blog-post": "ブログ記事",
	"template.responsive": "レスポンシブにする",
	"template.a11y": "アクセシビリティを改善",
	"template.dark-mode": "ダークモードを追加",
	"template.typography": "余白とタイポグラフィを整える",
	"template.states": "hover / focus の状態を追加",
	"template.simplify-css": "CSS を簡潔にする",
	"template.css-vars": "CSS カスタムプロパティを使う",

	"help.title": "ダイレクトモードの仕組み",
	"help.cloud.route":
		"リクエストはこのブラウザから {provider} へ直接送られます。このアプリのサーバーは介在せず、キーを見ることもありません。",
	"help.cloud.billing":
		"利用量・レート制限・請求はあなた自身の {provider} アカウントに紐づきます。利用状況はそちらで確認してください。",
	"help.cloud.storage":
		"キーはこのタブ（sessionStorage）にだけ保持され、タブを閉じると消えます。localStorage、URL、保存したプロジェクトには書き込まれません。「キーをすべて削除」で即座に消せます。",
	"help.cloud.docs":
		"Astro ドキュメントの検索は小さな中継を経由しますが、渡るのは検索文だけで、キーやコードは送られません。",
	"help.local.route":
		"リクエストはこのブラウザからあなたのマシン上の {provider} へ直接送られます。このアプリのサーバーは介在しません。",
	"help.local.billing":
		"課金はありません（モデルはローカルで動きます）。Astro ドキュメントの検索は小さな中継を経由しますが、渡るのは検索文だけです。",
	"help.local.setup": "{start}。{cors}",
	"help.unsupported":
		"{provider} はブラウザから呼び出せません（Cloudflare AI Gateway は CORS ヘッダーを返しません）。別のプロバイダーを選ぶか、接続を「サーバー」にしてください。",
	"help.getKey.anthropic": "Anthropic の API キーを取得",
	"help.getKey.openai": "OpenAI の API キーを取得",
	"help.getKey.google": "Google AI Studio の API キーを取得",
	"help.emptyNote.cloud":
		"ダイレクトモード: プロンプトはこのブラウザからあなたの API キーで {provider} へ直接送られます。",
	"help.emptyNote.local":
		"ダイレクトモード: プロンプトはこのブラウザから {provider} へ直接送られます。",

	"start.ollama": "`ollama serve` を実行",
	"start.lmstudio": "LM Studio の Developer タブで Start Server を押す",
	"cors.ollama.localhost":
		"localhost 系のオリジンは既定で許可されています。`OLLAMA_ORIGINS` を変更している場合はこのオリジンを含めてください。",
	"cors.ollama.origin":
		"このオリジンからの要求を受け付けるよう `OLLAMA_ORIGINS={origin} ollama serve` で起動してください。",
	"cors.lmstudio":
		"CORS を有効にしてサーバーを起動してください: `lms server start --cors`、または Developer タブの「Enable CORS」をオン。",
	"error.localUnreachable":
		"{provider}（{base}）に接続できません。{start}してから再試行してください。",
	"error.timeout":
		"モデルが時間内に応答しませんでした（{detail}）。再試行するか、別のモデルやプロバイダーを選んでください。",
	"error.directUnreachable":
		"ブラウザから {provider}（{base}）に接続できません。{start}。{cors}",
	"error.directNetwork":
		"ブラウザから {provider} に接続できませんでした（{detail}）。ネットワーク接続を確認して再試行してください。",
	"error.directUnsupported":
		"{provider} はブラウザから呼び出せません（Cloudflare AI Gateway は CORS ヘッダーを返しません）。使うには接続を「サーバー」にしてください。",
	"error.keyMissing":
		"{provider} の API キーがありません。上の API キー欄に貼り付けてください。キーはこのタブにだけ保持され、{provider} にのみ送られます。",
	"error.keyRejected":
		"{provider} が API キーを拒否しました（HTTP {status}）。キーを確認して再試行してください。",
	"error.rateLimited":
		"{provider} がこのキーをレート制限しています（HTTP 429{detail}）。少し待ってから再試行してください。",
	"error.providerError": "{provider} が HTTP {status} を返しました{detail}。",
	"hint.ollamaDown":
		"Ollama が起動していないか、モデルがありません。`ollama serve` を実行し、`ollama pull <model>` でモデルを取得してください。",
	"hint.lmstudioDown":
		"LM Studio のサーバーが起動していません。LM Studio の Developer タブで Start Server を押し、モデルをロードしてください。",
	"hint.noLocalModels":
		"ローカルサーバーにモデルがありません。モデルを取得またはロードしてから再読み込みしてください。",
	"hint.directLocal": "ブラウザから {base} を呼び出します。{cors}",
	"hint.directKey":
		"リクエストはブラウザからあなたの API キーで {provider} へ直接送られるため、利用量とレート制限はあなたのアカウントに課金されます。キーはこのタブ（sessionStorage）にだけ保持され、localStorage や URL には置かれません。",
	"hint.keyMissing":
		"ダイレクトモードを使うには {provider} の API キーを入力してください。",
	"hint.directUnsupported":
		"{provider} は接続が「サーバー」のときだけ使えます（Cloudflare AI Gateway は CORS ヘッダーを返しません）。",
};
