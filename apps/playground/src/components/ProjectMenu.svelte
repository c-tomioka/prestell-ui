<script lang="ts">
	import type { ProjectSummary } from '../lib/projects/types';

	interface Props {
		projects: ProjectSummary[];
		currentId: string | null;
		disabled?: boolean;
		onCreate: () => void;
		onOpen: (id: string) => void;
		onRename: (name: string) => void;
		onDelete: () => void;
	}

	let { projects, currentId, disabled = false, onCreate, onOpen, onRename, onDelete }: Props = $props();

	const current = $derived(projects.find((p) => p.id === currentId) ?? null);

	function rename() {
		if (!current) return;
		const name = window.prompt('Project name', current.name)?.trim();
		if (name && name !== current.name) onRename(name);
	}

	function remove() {
		if (!current) return;
		if (window.confirm(`Delete project “${current.name}” and its chat history?`)) onDelete();
	}
</script>

<div class="project-menu">
	<label for="project-select">
		<span>project</span>
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
	<button type="button" class="ghost" {disabled} onclick={onCreate}>New</button>
	<button type="button" class="ghost" disabled={disabled || !current} onclick={rename}>Rename</button>
	<button type="button" class="ghost" disabled={disabled || !current} onclick={remove}>Delete</button>
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
	button {
		appearance: none;
		cursor: pointer;
		font-size: 0.74rem;
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--border);
		white-space: nowrap;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.ghost {
		background: transparent;
		color: var(--muted);
	}
	.ghost:not(:disabled):hover {
		color: var(--fg);
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
