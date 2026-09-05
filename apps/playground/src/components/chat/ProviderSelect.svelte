<script lang="ts">
	import type { ProviderInfo } from '../../lib/ai/types';

	interface Props {
		providers: ProviderInfo[];
		provider: string;
		model: string;
		models: string[];
		modelsError: string;
		loadingModels: boolean;
		disabled: boolean;
		onProviderChange: (provider: string) => void;
		onModelChange: (model: string) => void;
		onRefresh: () => void;
	}

	let {
		providers,
		provider,
		model,
		models,
		modelsError,
		loadingModels,
		disabled,
		onProviderChange,
		onModelChange,
		onRefresh,
	}: Props = $props();

	const current = $derived(providers.find((p) => p.id === provider));
	const listId = 'chat-model-options';
</script>

<div class="provider">
	<label>
		<span>Provider</span>
		<select
			value={provider}
			{disabled}
			onchange={(e) => onProviderChange(e.currentTarget.value)}
		>
			{#each providers as p (p.id)}
				<option value={p.id} disabled={!p.configured}>
					{p.label}{p.configured ? '' : ' (not configured)'}
				</option>
			{/each}
		</select>
	</label>
	<label>
		<span>Model</span>
		<span class="model-row">
			<input
				list={listId}
				value={model}
				{disabled}
				placeholder={loadingModels ? 'Loading models…' : 'model id'}
				spellcheck="false"
				oninput={(e) => onModelChange(e.currentTarget.value)}
			/>
			<datalist id={listId}>
				{#each models as m (m)}<option value={m}></option>{/each}
			</datalist>
			<button type="button" class="ghost" title="Reload model list" aria-label="Reload model list" onclick={onRefresh} {disabled}>↻</button>
		</span>
	</label>
	{#if modelsError}
		<p class="hint error" role="alert">{modelsError}</p>
	{:else if current?.hint}
		<p class="hint">{current.hint}</p>
	{/if}
</div>

<style>
	.provider {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.72rem;
		color: var(--muted);
	}
	select,
	input {
		width: 100%;
		min-width: 0;
		font-size: 0.78rem;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.3rem 0.4rem;
	}
	input {
		font-family: ui-monospace, monospace;
	}
	.model-row {
		display: flex;
		gap: 0.3rem;
	}
	.ghost {
		appearance: none;
		cursor: pointer;
		font-size: 0.85rem;
		border-radius: 6px;
		padding: 0 0.5rem;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--muted);
	}
	.ghost:hover {
		color: var(--fg);
	}
	.hint {
		margin: 0;
		font-size: 0.7rem;
		color: var(--muted);
		white-space: pre-wrap;
	}
	.hint.error {
		color: var(--err);
	}
</style>
