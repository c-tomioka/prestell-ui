<script lang="ts">
	import { type PromptTemplate, templatesByCategory } from '../../lib/ai/templates';

	interface Props {
		disabled: boolean;
		onPick: (template: PromptTemplate) => void;
	}

	let { disabled, onPick }: Props = $props();

	const groups = templatesByCategory();
	const byId = new Map(groups.flatMap((g) => g.templates.map((t) => [t.id, t] as const)));

	function pick(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const template = byId.get(select.value);
		// Reset so the same template can be picked again.
		select.value = '';
		if (template) onPick(template);
	}
</script>

<label class="template">
	<span class="visually-hidden">Insert a prompt template</span>
	<select value="" {disabled} onchange={pick}>
		<option value="">Template…</option>
		{#each groups as group (group.category)}
			<optgroup label={group.label}>
				{#each group.templates as template (template.id)}
					<option value={template.id}>{template.label}</option>
				{/each}
			</optgroup>
		{/each}
	</select>
</label>

<style>
	.template {
		display: inline-flex;
		align-items: center;
		min-width: 0;
	}
	select {
		font-size: 0.72rem;
		color: var(--muted);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.25rem 0.3rem;
		max-width: 11rem;
	}
	select:not(:disabled):hover {
		color: var(--fg);
	}
	select:disabled {
		opacity: 0.5;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
