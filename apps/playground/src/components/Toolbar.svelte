<!-- Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root. -->
<script lang="ts">
	import type { CompileOptions } from '@astrojs/compiler-binding';
	import type { Theme } from '../lib/codemirror';
	import { t } from '../lib/i18n';
	import { COMPACT_OPTIONS, SCOPED_STYLE_STRATEGIES, SOURCEMAP_OPTIONS } from '../lib/options';
	import type { ProjectMode, ProjectSummary } from '../lib/projects/types';

	export type SaveFeedback = 'idle' | 'saved' | 'downloaded' | 'failed';
	export type ExportKind = 'zip' | 'directory';
	export type ShareFeedback = 'idle' | 'copied' | 'failed';

	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';
	import ProjectMenu from './ProjectMenu.svelte';

	interface Props {
		options: CompileOptions;
		theme: Theme;
		shareFeedback: ShareFeedback;
		saveFeedback: SaveFeedback;
		onSave: () => void;
		onChange: () => void;
		onToggleTheme: () => void;
		onShare: () => void;
		chatOpen: boolean;
		onToggleChat: () => void;
		projects: ProjectSummary[];
		currentProjectId: string | null;
		/** True while the project store is still loading. */
		projectsBusy: boolean;
		onCreateProject: (mode: ProjectMode) => void;
		onOpenProject: (id: string) => void;
		onRenameProject: (name: string) => void;
		onDeleteProject: () => void;
		onPromoteProject: () => void;
		/** Share links only cover Component projects (one file fits in `#code=`). */
		shareAvailable: boolean;
		/** Page / Site projects can be exported as an Astro project. */
		exportAvailable: boolean;
		/** File System Access API present (folder export offered). */
		directoryExportSupported: boolean;
		exportFeedback: SaveFeedback;
		onExport: (kind: ExportKind) => void;
	}

	let {
		options,
		theme,
		shareFeedback,
		saveFeedback,
		onSave,
		onChange,
		onToggleTheme,
		onShare,
		chatOpen,
		onToggleChat,
		projects,
		currentProjectId,
		projectsBusy,
		onCreateProject,
		onOpenProject,
		onRenameProject,
		onDeleteProject,
		onPromoteProject,
		shareAvailable,
		exportAvailable,
		directoryExportSupported,
		exportFeedback,
		onExport,
	}: Props = $props();

	let exportMenuOpen = $state(false);
	function pickExport(kind: ExportKind) {
		exportMenuOpen = false;
		onExport(kind);
	}
	const exportState = $derived<Feedback>(
		exportFeedback === 'idle' ? 'idle' : exportFeedback === 'failed' ? 'error' : 'done',
	);
	const exportLabel = $derived(
		exportFeedback === 'failed'
			? $t('toolbar.exportFailed')
			: exportFeedback === 'idle'
				? ''
				: $t('toolbar.exported'),
	);

	function setSourcemap(value: string) {
		options.sourcemap = value === 'none' ? undefined : (value as CompileOptions['sourcemap']);
		onChange();
	}
	function setCompact(value: string) {
		options.compact = value as CompileOptions['compact'];
		onChange();
	}
	function setScoped(value: string) {
		options.scopedStyleStrategy = value as CompileOptions['scopedStyleStrategy'];
		onChange();
	}

	// Save / Share show transient feedback ("Saved!", "Copied!", "… failed") in
	// place of their default label; mirror that in the icon and pin the tooltip.
	type Feedback = 'idle' | 'done' | 'error';
	const saveState = $derived<Feedback>(
		saveFeedback === 'idle' ? 'idle' : saveFeedback === 'failed' ? 'error' : 'done',
	);
	const shareState = $derived<Feedback>(
		shareFeedback === 'idle' ? 'idle' : shareFeedback === 'failed' ? 'error' : 'done',
	);
	const saveLabel = $derived(
		saveFeedback === 'saved'
			? $t('toolbar.saved')
			: saveFeedback === 'downloaded'
				? $t('toolbar.downloaded')
				: saveFeedback === 'failed'
					? $t('toolbar.saveFailed')
					: '',
	);
	const shareLabel = $derived(
		shareFeedback === 'copied' ? $t('toolbar.copied') : shareFeedback === 'failed' ? $t('toolbar.copyFailed') : '',
	);
	const feedbackIcon = { done: 'check', error: 'x' } as const;
</script>

<div class="toolbar">
	<div class="left">
	<ProjectMenu
		{projects}
		currentId={currentProjectId}
		disabled={projectsBusy}
		onCreate={onCreateProject}
		onOpen={onOpenProject}
		onRename={onRenameProject}
		onDelete={onDeleteProject}
		onPromote={onPromoteProject}
	/>
	<form class="options" onsubmit={(e) => e.preventDefault()}>
		<label for="opt-sourcemap">
			<span>{$t('toolbar.sourcemap')}</span>
			<select
				id="opt-sourcemap"
				name="sourcemap"
				value={options.sourcemap ?? 'none'}
				onchange={(e) => setSourcemap(e.currentTarget.value)}
			>
				<option value="none">none</option>
				{#each SOURCEMAP_OPTIONS as option (option)}<option value={option}>{option}</option>{/each}
			</select>
		</label>
		<label for="opt-compact">
			<span>{$t('toolbar.compact')}</span>
			<select
				id="opt-compact"
				name="compact"
				value={options.compact ?? 'none'}
				onchange={(e) => setCompact(e.currentTarget.value)}
			>
				{#each COMPACT_OPTIONS as option (option)}<option value={option}>{option}</option>{/each}
			</select>
		</label>
		<label for="opt-scoped-style">
			<span>{$t('toolbar.scopedStyle')}</span>
			<select
				id="opt-scoped-style"
				name="scopedStyleStrategy"
				value={options.scopedStyleStrategy ?? 'where'}
				onchange={(e) => setScoped(e.currentTarget.value)}
			>
				{#each SCOPED_STYLE_STRATEGIES as option (option)}<option value={option}>{option}</option>{/each}
			</select>
		</label>
	</form>
	</div>

	<div class="actions">
		<IconButton label={chatOpen ? $t('toolbar.hideChat') : $t('toolbar.showChat')} active={chatOpen} onclick={onToggleChat}>
			<Icon name="sparkles" />
		</IconButton>
		<IconButton label={theme === 'dark' ? $t('toolbar.switchToLight') : $t('toolbar.switchToDark')} onclick={onToggleTheme}>
			<Icon name={theme === 'dark' ? 'sun' : 'moon'} />
		</IconButton>
		<IconButton
			label={saveState === 'idle' ? $t('toolbar.save') : saveLabel}
			showTip={saveState !== 'idle'}
			onclick={onSave}
		>
			<Icon name={saveState === 'idle' ? 'save' : feedbackIcon[saveState]} />
		</IconButton>
		{#if exportAvailable}
			<span class="export">
				<IconButton
					label={exportState === 'idle' ? $t('toolbar.export') : exportLabel}
					showTip={exportState !== 'idle'}
					active={exportMenuOpen}
					onclick={() => (exportMenuOpen = !exportMenuOpen)}
				>
					<Icon name={exportState === 'idle' ? 'download' : feedbackIcon[exportState]} />
				</IconButton>
				{#if exportMenuOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="export-menu"
						role="menu"
						aria-label={$t('toolbar.export')}
						onkeydown={(e) => {
							if (e.key === 'Escape') exportMenuOpen = false;
						}}
					>
						<button type="button" role="menuitem" class="export-item" onclick={() => pickExport('zip')}>
							<span class="item-name">{$t('toolbar.exportZip')}</span>
							<span class="item-hint">{$t('toolbar.exportZipHint')}</span>
						</button>
						{#if directoryExportSupported}
							<button type="button" role="menuitem" class="export-item" onclick={() => pickExport('directory')}>
								<span class="item-name">{$t('toolbar.exportFolder')}</span>
								<span class="item-hint">{$t('toolbar.exportFolderHint')}</span>
							</button>
						{/if}
					</div>
				{/if}
			</span>
		{/if}
		<IconButton
			label={!shareAvailable
				? $t('toolbar.shareComponentOnly')
				: shareState === 'idle'
					? $t('toolbar.share')
					: shareLabel}
			showTip={shareState !== 'idle'}
			variant="accent"
			tipAlign="end"
			disabled={!shareAvailable}
			onclick={onShare}
		>
			<Icon name={shareState === 'idle' ? 'share' : feedbackIcon[shareState]} />
		</IconButton>
	</div>

	<span class="visually-hidden" role="status" aria-live="polite">
		{shareLabel}
		{saveLabel}
		{exportLabel}
	</span>
</div>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		flex: none;
		min-height: 40px;
		padding: 0.4rem 0.75rem;
		border-bottom: 1px solid var(--border);
		background: var(--panel);
	}
	.left {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1.25rem;
		min-width: 0;
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.9rem;
		margin: 0;
		min-width: 0;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.74rem;
		color: var(--muted);
		white-space: nowrap;
	}
	select {
		appearance: auto;
		font-size: 0.74rem;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.15rem 0.3rem;
		max-width: 8rem;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.export {
		position: relative;
		display: inline-flex;
	}
	.export-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		min-width: 16rem;
		padding: 0.25rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--panel);
		box-shadow: 0 8px 24px rgb(0 0 0 / 20%);
	}
	.export-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		padding: 0.4rem 0.6rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.export-item:hover,
	.export-item:focus-visible {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		outline: none;
	}
	.item-name {
		font-size: 0.8rem;
		font-weight: 600;
	}
	.item-hint {
		font-size: 0.7rem;
		color: var(--muted);
	}

	@media (max-width: 800px) {
		.toolbar {
			justify-content: flex-start;
		}
		.left,
		.options,
		.actions {
			width: 100%;
		}
		.actions {
			justify-content: flex-end;
		}
		label {
			flex: 1 1 auto;
			justify-content: space-between;
		}
		select {
			max-width: none;
		}
	}
</style>
