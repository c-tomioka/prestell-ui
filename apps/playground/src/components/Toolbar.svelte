<!-- Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root. -->
<script lang="ts">
	import type { CompileOptions } from '@astrojs/compiler-binding';
	import type { Theme } from '../lib/codemirror';
	import { t } from '../lib/i18n';
	import { COMPACT_OPTIONS, SCOPED_STYLE_STRATEGIES, SOURCEMAP_OPTIONS } from '../lib/options';
	import type { ProjectSummary } from '../lib/projects/types';

	export type SaveFeedback = 'idle' | 'saved' | 'downloaded' | 'failed';
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
		onCreateProject: () => void;
		onOpenProject: (id: string) => void;
		onRenameProject: (name: string) => void;
		onDeleteProject: () => void;
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
	}: Props = $props();

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
		<IconButton
			label={shareState === 'idle' ? $t('toolbar.share') : shareLabel}
			showTip={shareState !== 'idle'}
			variant="accent"
			tipAlign="end"
			onclick={onShare}
		>
			<Icon name={shareState === 'idle' ? 'share' : feedbackIcon[shareState]} />
		</IconButton>
	</div>

	<span class="visually-hidden" role="status" aria-live="polite">
		{shareLabel}
		{saveLabel}
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
