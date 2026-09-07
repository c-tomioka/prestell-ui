<script lang="ts">
	import { t } from '../lib/i18n';
	import type { ProjectMode, ProjectSummary } from '../lib/projects/types';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';

	interface Props {
		projects: ProjectSummary[];
		currentId: string | null;
		disabled?: boolean;
		onCreate: (mode: ProjectMode) => void;
		onOpen: (id: string) => void;
		onRename: (name: string) => void;
		onDelete: () => void;
		/** Component → Page conversion (only offered for Component projects). */
		onPromote: () => void;
	}

	let { projects, currentId, disabled = false, onCreate, onOpen, onRename, onDelete, onPromote }: Props =
		$props();

	const current = $derived(projects.find((p) => p.id === currentId) ?? null);
	const MODES: ProjectMode[] = ['component', 'page', 'site'];
	let pickingMode = $state(false);

	function pick(mode: ProjectMode) {
		pickingMode = false;
		onCreate(mode);
	}

	function onModeKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			pickingMode = false;
			event.preventDefault();
		}
	}

	function rename() {
		if (!current) return;
		const name = window.prompt($t('project.namePrompt'), current.name)?.trim();
		if (name && name !== current.name) onRename(name);
	}

	function remove() {
		if (!current) return;
		if (window.confirm($t('project.deleteConfirm', { name: current.name }))) onDelete();
	}
</script>

<div class="project-menu">
	<label for="project-select">
		<span>{$t('toolbar.project')}</span>
		<select
			id="project-select"
			name="project"
			value={currentId ?? ''}
			{disabled}
			onchange={(e) => onOpen(e.currentTarget.value)}
		>
			{#each projects as project (project.id)}
				<option value={project.id}>{project.name}</option>
			{/each}
		</select>
	</label>
	<span class="new">
		<IconButton
			label={$t('project.new')}
			{disabled}
			active={pickingMode}
			onclick={() => (pickingMode = !pickingMode)}
		>
			<Icon name="plus" />
		</IconButton>
		{#if pickingMode}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modes" role="menu" aria-label={$t('project.newTitle')} onkeydown={onModeKeydown}>
				{#each MODES as mode (mode)}
					<button type="button" role="menuitem" class="mode" onclick={() => pick(mode)}>
						<span class="mode-name">{$t(`project.mode.${mode}`)}</span>
						<span class="mode-hint">{$t(`project.mode.${mode}.hint`)}</span>
					</button>
				{/each}
				<button type="button" role="menuitem" class="mode cancel" onclick={() => (pickingMode = false)}>
					{$t('project.cancel')}
				</button>
			</div>
		{/if}
	</span>
	{#if current?.mode === 'component'}
		<IconButton label={$t('project.promote')} disabled={disabled || !current} onclick={onPromote}>
			<Icon name="layout" />
		</IconButton>
	{/if}
	<IconButton label={$t('project.rename')} disabled={disabled || !current} onclick={rename}>
		<Icon name="pencil" />
	</IconButton>
	<IconButton label={$t('project.delete')} disabled={disabled || !current} onclick={remove}>
		<Icon name="trash" />
	</IconButton>
</div>

<style>
	.project-menu {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.74rem;
		color: var(--muted);
		white-space: nowrap;
		min-width: 0;
	}
	select {
		appearance: auto;
		font-size: 0.74rem;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.15rem 0.3rem;
		max-width: 12rem;
		min-width: 6rem;
	}
	.new {
		position: relative;
		display: inline-flex;
	}
	.modes {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		min-width: 15rem;
		padding: 0.25rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--panel);
		box-shadow: 0 8px 24px rgb(0 0 0 / 20%);
	}
	.mode {
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
	.mode:hover,
	.mode:focus-visible {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		outline: none;
	}
	.mode-name {
		font-size: 0.8rem;
		font-weight: 600;
	}
	.mode-hint {
		font-size: 0.7rem;
		color: var(--muted);
	}
	.cancel {
		color: var(--muted);
		font-size: 0.74rem;
		border-top: 1px solid var(--border);
		border-radius: 0;
	}
	@media (max-width: 800px) {
		.project-menu {
			width: 100%;
		}
		label {
			flex: 1 1 auto;
		}
		select {
			max-width: none;
			flex: 1;
		}
	}
</style>
