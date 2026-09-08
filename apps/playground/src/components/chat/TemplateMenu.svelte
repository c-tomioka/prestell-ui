<script lang="ts">
	import { type PromptTemplate, templatesByCategory } from '../../lib/ai/templates';
	import { type MessageKey, t } from '../../lib/i18n';

	interface Props {
		disabled: boolean;
		/** Page / Site mode: also offer the multi-file templates. */
		multiFile?: boolean;
		onPick: (template: PromptTemplate) => void;
	}

	let { disabled, multiFile = false, onPick }: Props = $props();

	const groups = $derived(templatesByCategory({ multiFile }));
	// Titles are translated by id; the prompt text itself stays English.
	const templateLabel = (id: string) => $t(`template.${id}` as MessageKey);
	const byId = $derived(new Map(groups.flatMap((g) => g.templates.map((t) => [t.id, t] as const))));

	function pick(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const template = byId.get(select.value);
		// Reset so the same template can be picked again.
		select.value = '';
		if (template) onPick(template);
	}
</script>

<label class="template">
	<span class="visually-hidden">{$t('template.insert')}</span>
	<select value="" {disabled} onchange={pick}>
		<option value="">{$t('template.placeholder')}</option>
		{#each groups as group (group.category)}
			<optgroup label={$t(`template.category.${group.category}`)}>
				{#each group.templates as template (template.id)}
					<option value={template.id}>{templateLabel(template.id)}</option>
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
