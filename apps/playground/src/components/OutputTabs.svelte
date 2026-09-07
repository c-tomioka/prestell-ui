<!-- biome-ignore-all lint/a11y/useValidAriaValues: aria-selected is bound to a dynamic boolean; biome can't statically evaluate Svelte expressions -->
<!-- Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root. -->
<script lang="ts">
	import type { CompileResult, Component } from '@astrojs/compiler-binding';
	import { onMount, tick, untrack } from 'svelte';
	import {
		createOutputView,
		type EditorLanguage,
		type OutputViewHandle,
		type Theme,
	} from '../lib/codemirror';
	import type { ParsedAst } from '../lib/compiler-protocol';
	import { type MessageKey, t } from '../lib/i18n';
	import type { PreviewRendererMode } from '../lib/preview-protocol';

	interface Props {
		result: CompileResult | null;
		ast: ParsedAst | null;
		theme: Theme;
		previewStatus: 'idle' | 'rendering' | 'ready' | 'error' | 'unsupported';
		previewDocument: string;
		previewError: string;
		autoPreview: boolean;
		previewStale: boolean;
		rendererMode: PreviewRendererMode;
		/** False when generated code runs in a Worker of this origin (no sandbox origin). */
		rendererIsolated: boolean;
		/** `.astro` files that can be rendered (pages first); the select shows when there are several. */
		entries: string[];
		entry: string;
		/** True when the active editor file is not an `.astro` file (no compiler output). */
		activeIsAstro: boolean;
		onEntryChange: (path: string) => void;
		onTabChange: (tab: TabId) => void;
		onToggleAutoPreview: () => void;
		onRefreshPreview: () => void;
	}

	let {
		result,
		ast,
		theme,
		previewStatus,
		previewDocument,
		previewError,
		autoPreview,
		previewStale,
		rendererMode,
		rendererIsolated,
		entries,
		entry,
		activeIsAstro,
		onEntryChange,
		onTabChange,
		onToggleAutoPreview,
		onRefreshPreview,
	}: Props = $props();

	type TabId =
		| 'preview'
		| 'js'
		| 'css'
		| 'scripts'
		| 'metadata'
		| 'diagnostics'
		| 'ast'
		| 'sourcemap';

	const TABS: { id: TabId; label: MessageKey }[] = [
		{ id: 'preview', label: 'tabs.preview' },
		{ id: 'js', label: 'tabs.js' },
		{ id: 'css', label: 'tabs.css' },
		{ id: 'scripts', label: 'tabs.scripts' },
		{ id: 'metadata', label: 'tabs.metadata' },
		{ id: 'diagnostics', label: 'tabs.diagnostics' },
		{ id: 'ast', label: 'tabs.ast' },
		{ id: 'sourcemap', label: 'tabs.sourcemap' },
	];

	const CODE_TABS = new Set<TabId>(['js', 'css', 'scripts', 'ast', 'sourcemap']);

	let active = $state<TabId>('preview');

	const diagnosticCount = $derived(result?.diagnostics.length ?? 0);
	const isCodeTab = $derived(CODE_TABS.has(active));

	function selectTab(tab: TabId) {
		active = tab;
		onTabChange(tab);
	}

	// Arrow-key navigation for the tablist (WAI-ARIA tabs pattern).
	async function onTabKeydown(event: KeyboardEvent) {
		const index = TABS.findIndex((tab) => tab.id === active);
		let next = index;
		if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
		else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = TABS.length - 1;
		else return;
		event.preventDefault();
		selectTab(TABS[next].id);
		await tick();
		document.getElementById(`tab-${active}`)?.focus();
	}

	function formatComponents(components: Component[]): string {
		if (!components || components.length === 0) return '—';
		return components
			.map((component) => `${component.localName} (${component.specifier})`)
			.join('\n');
	}

	function formatSourceMap(map: string): string {
		if (!map) return '// No source map was generated for the current options.';
		try {
			return JSON.stringify(JSON.parse(map), null, 2);
		} catch {
			return map;
		}
	}

	function codeFor(tab: TabId): { text: string; language: EditorLanguage } {
		if (!result) return { text: '', language: 'text' };
		switch (tab) {
			case 'js':
				return { text: result.code, language: 'javascript' };
			case 'css':
				return {
					text:
						result.css.length > 0
							? result.css.join('\n\n')
							: '/* No <style> output for this component. */',
					language: 'css',
				};
			case 'scripts':
				return {
					text:
						result.scripts.length > 0
							? result.scripts
									.map((script, index) =>
										script.type === 'inline'
											? `// script #${index + 1} (inline)\n${script.code ?? ''}`
											: `// script #${index + 1} (external)\n// src: ${script.src ?? ''}`,
									)
									.join('\n\n')
							: '// No hoisted <script> tags in this component.',
					language: 'javascript',
				};
			case 'ast':
				return { text: ast ? JSON.stringify(ast.ast, null, 2) : '', language: 'json' };
			case 'sourcemap':
				return { text: formatSourceMap(result.map), language: 'json' };
			default:
				return { text: '', language: 'text' };
		}
	}

	let host: HTMLDivElement;
	let view: OutputViewHandle | undefined;

	onMount(() => {
		view = createOutputView({
			parent: host,
			doc: '',
			language: 'javascript',
			theme: untrack(() => theme),
			ariaLabel: $t('output.compiled'),
		});
		return () => view?.destroy();
	});

	$effect(() => {
		if (!view || !isCodeTab) return;
		const code = codeFor(active);
		view.setContent(code.text, code.language);
	});

	$effect(() => {
		view?.setTheme(theme);
	});
</script>

<div class="outputs">
	<div class="output-head">
	<div class="tablist" role="tablist" aria-label={$t('output.tablist')}>
		{#each TABS as tab (tab.id)}
			<button
				type="button"
				role="tab"
				id={`tab-${tab.id}`}
				class="tab"
				class:active={active === tab.id}
				aria-selected={active === tab.id}
				aria-controls="output-panel"
				tabindex={active === tab.id ? 0 : -1}
				onclick={() => selectTab(tab.id)}
				onkeydown={onTabKeydown}
			>
				{$t(tab.label)}
				{#if tab.id === 'diagnostics' && diagnosticCount > 0}
					<span class="badge">{diagnosticCount}</span>
				{/if}
			</button>
		{/each}
	</div>
		<div class="preview-controls" class:inactive={active !== 'preview'}>
			{#if entries.length > 1}
				<label class="entry" title={$t('output.entryTitle')}>
					<span>{$t('output.entry')}</span>
					<select
						name="entry"
						value={entry}
						disabled={active !== 'preview'}
						onchange={(e) => onEntryChange(e.currentTarget.value)}
					>
						{#each entries as path (path)}
							<option value={path}>{path.replace(/^src\/pages\//, '')}</option>
						{/each}
					</select>
				</label>
			{/if}
			<span
				class="renderer"
				class:unisolated={!rendererIsolated}
				title={rendererMode === 'server'
					? $t('output.renderer.server')
					: rendererIsolated
						? $t('output.renderer.sandboxed')
						: $t('output.renderer.unisolated')}
			>
				{rendererMode === 'server'
					? $t('output.badge.server')
					: rendererIsolated
						? $t('output.badge.sandboxed')
						: $t('output.badge.unisolated')}
			</span>
			<label class="switch" title={$t('output.autoTitle')}>
				<input
					type="checkbox"
					role="switch"
					aria-checked={autoPreview}
					checked={autoPreview}
					disabled={active !== 'preview'}
					onchange={onToggleAutoPreview}
				/>
				<span class="track" aria-hidden="true"></span>
				<span class="switch-label">{$t('output.auto')}</span>
			</label>
			<button
				type="button"
				class="refresh"
				class:stale={previewStale}
				class:spinning={previewStatus === 'rendering'}
				aria-label={previewStale ? $t('output.renderNowStale') : $t('output.renderNow')}
				title={previewStale ? $t('output.stale') : $t('output.renderNow')}
				disabled={active !== 'preview' || previewStatus === 'rendering'}
				onclick={onRefreshPreview}
			>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<path
						d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
					/>
					<path d="M13.6 1.6v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>
		</div>
	</div>

	<!-- biome-ignore lint/a11y/noNoninteractiveTabindex: false-positive. A tabpanel must have a tab index -->
	<div class="panel" id="output-panel" role="tabpanel" aria-labelledby={`tab-${active}`} tabindex="0">
		<div class="code-host" bind:this={host} hidden={!isCodeTab || !activeIsAstro}></div>

		{#if !activeIsAstro && active !== 'preview'}
			<div class="preview-state" role="status">
				<p>{$t('output.notAstro')}</p>
			</div>
		{:else if active === 'preview'}
			<div class="preview">
				{#if previewStatus === 'ready' && previewStale}
					<div class="stale-banner" role="status">
						{$t('output.staleBanner')}
					</div>
				{/if}
				{#if previewStatus === 'ready'}
					<iframe
						class="preview-frame"
						title={$t('output.frameTitle')}
						sandbox="allow-scripts"
						referrerpolicy="no-referrer"
						srcdoc={previewDocument}
					></iframe>
				{:else if previewStatus === 'error' || previewStatus === 'unsupported'}
					<div class="preview-state preview-error" role="alert">
						<p>{previewError}</p>
					</div>
				{:else}
					<div class="preview-state" role="status" aria-live="polite">
						<p>{previewStatus === 'rendering' ? $t('output.rendering') : $t('output.selectPreview')}</p>
					</div>
				{/if}
			</div>
		{:else if active === 'metadata'}
			<div class="structured">
				{#if result}
					<dl>
						<dt>{$t('output.scopeHash')}</dt>
						<dd><code>{result.scope || '—'}</code></dd>
						<dt>{$t('output.containsHead')}</dt>
						<dd>{result.containsHead}</dd>
						<dt>{$t('output.propagation')}</dt>
						<dd>{result.propagation}</dd>
						<dt>{$t('output.hydrated')}</dt>
						<dd>{formatComponents(result.hydratedComponents)}</dd>
						<dt>{$t('output.clientOnly')}</dt>
						<dd>{formatComponents(result.clientOnlyComponents)}</dd>
						<dt>{$t('output.serverComponents')}</dt>
						<dd>{formatComponents(result.serverComponents)}</dd>
						{#if result.styleError.length > 0}
							<dt>{$t('output.styleErrors')}</dt>
							<dd class="error">{result.styleError.join('\n')}</dd>
						{/if}
					</dl>
				{:else}
					<p class="empty">{$t('output.nothingCompiled')}</p>
				{/if}
			</div>
		{:else if active === 'diagnostics'}
			<div class="structured">
				{#if result && result.diagnostics.length > 0}
					<ul class="diagnostics">
						{#each result.diagnostics as diagnostic, index (index)}
							<li class={diagnostic.severity}>
								<span class="severity">{diagnostic.severity}</span>
								<div class="diag-body">
									<p class="diag-text">{diagnostic.text}</p>
									{#if diagnostic.hint}<p class="diag-hint">{diagnostic.hint}</p>{/if}
									{#if diagnostic.labels?.[0]}
										<p class="diag-loc">
											line {diagnostic.labels[0].line}, column {diagnostic.labels[0].column + 1}
										</p>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">{$t('output.noDiagnostics')}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.outputs {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.output-head {
		display: flex;
		align-items: center;
		flex: none;
		height: 40px;
		border-bottom: 1px solid var(--border);
		background: var(--panel);
	}
	.tablist {
		display: flex;
		flex: 1 1 auto;
		min-width: 0;
		align-items: center;
		gap: 0.125rem;
		height: 100%;
		padding: 0 0.25rem;
		overflow-x: auto;
	}
	.preview-controls {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0 0.5rem;
		flex: none;
		border-left: 1px solid var(--border);
		height: 100%;
	}
	.preview-controls.inactive {
		opacity: 0.45;
	}
	.entry {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.entry select {
		appearance: auto;
		max-width: 11rem;
		font-size: 0.72rem;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.1rem 0.25rem;
	}
	.renderer {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
	}
	.renderer.unisolated {
		color: var(--warn);
		border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.72rem;
		color: var(--muted);
		cursor: pointer;
		position: relative;
	}
	.switch input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.switch .track {
		width: 26px;
		height: 14px;
		border-radius: 999px;
		background: var(--border);
		position: relative;
		transition: background 0.15s;
	}
	.switch .track::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--bg);
		transition: transform 0.15s;
	}
	.switch input:checked + .track {
		background: var(--accent);
	}
	.switch input:checked + .track::after {
		transform: translateX(12px);
	}
	.switch input:focus-visible + .track {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.switch input:disabled ~ * {
		cursor: default;
	}
	.refresh {
		appearance: none;
		display: inline-grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		position: relative;
	}
	.refresh:not(:disabled):hover {
		color: var(--fg);
		border-color: var(--accent);
	}
	.refresh:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.refresh.stale::after {
		content: '';
		position: absolute;
		top: -3px;
		right: -3px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		border: 1px solid var(--panel);
	}
	.refresh.spinning svg {
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.stale-banner {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1;
		padding: 0.3rem 0.75rem;
		font-size: 0.72rem;
		/* The banner background is a lightened accent, so dark text reads better than --on-accent. */
		color: #1b0a26;
		background: color-mix(in srgb, var(--accent) 85%, white);
		border-bottom: 1px solid var(--border);
	}
	.tab {
		appearance: none;
		border: none;
		background: transparent;
		color: var(--muted);
		font-size: 0.8rem;
		padding: 0.4rem 0.7rem;
		border-radius: 6px 6px 0 0;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.tab:hover {
		color: var(--fg);
	}
	.tab.active {
		color: var(--fg);
		background: var(--bg);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.badge {
		font-size: 0.7rem;
		background: var(--accent);
		color: var(--on-accent);
		border-radius: 999px;
		padding: 0 0.4rem;
		line-height: 1.4;
	}
	.panel {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	.code-host {
		position: absolute;
		inset: 0;
	}
	.code-host[hidden] {
		display: none;
	}
	.preview,
	.preview-frame {
		width: 100%;
		height: 100%;
	}
	.preview {
		position: relative;
		background: #fff;
	}
	.preview-frame {
		display: block;
		border: 0;
	}
	.preview-state {
		display: grid;
		place-items: center;
		height: 100%;
		padding: 1rem;
		background: var(--bg);
		color: var(--muted);
		font-size: 0.85rem;
		text-align: center;
	}
	.preview-state p {
		margin: 0;
		white-space: pre-wrap;
	}
	.preview-error {
		color: var(--err);
	}
	:global(.code-host .cm-editor) {
		height: 100%;
	}
	:global(.code-host .cm-scroller) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 13px;
	}
	.structured {
		padding: 1rem;
		font-size: 0.85rem;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.4rem 1rem;
		margin: 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.diagnostics {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.diagnostics li {
		display: flex;
		gap: 0.6rem;
		padding: 0.6rem;
		border-radius: 6px;
		background: var(--panel);
		border-left: 3px solid var(--muted);
	}
	.diagnostics li.error {
		border-left-color: #f87171;
	}
	.diagnostics li.warning {
		border-left-color: #fbbf24;
	}
	.severity {
		text-transform: uppercase;
		font-size: 0.65rem;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.diag-body {
		flex: 1;
	}
	.diag-text {
		margin: 0 0 0.25rem;
	}
	.diag-hint,
	.diag-loc {
		margin: 0;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.empty {
		color: var(--muted);
	}
	.error {
		color: #f87171;
	}
	code {
		font-family: ui-monospace, monospace;
	}
</style>
