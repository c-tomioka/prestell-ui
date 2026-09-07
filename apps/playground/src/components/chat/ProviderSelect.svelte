<script lang="ts">
	import { CONNECTION_HINTS } from '../../lib/ai/messages';
	import type { Connection } from '../../lib/ai/settings';
	import type { ProviderInfo } from '../../lib/ai/types';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';

	interface Props {
		/** `server` = through /api/chat; `direct` = browser → provider (BYOK). */
		connection: Connection;
		providers: ProviderInfo[];
		provider: string;
		model: string;
		models: string[];
		modelsNotice: { level: 'warning' | 'error'; text: string } | null;
		loadingModels: boolean;
		disabled: boolean;
		/** Direct mode, cloud provider: the key held for this tab ("" = none). */
		apiKey: string;
		/** Direct mode, local provider: where the browser reaches the server. */
		baseUrl: string;
		onConnectionChange: (connection: Connection) => void;
		onProviderChange: (provider: string) => void;
		onModelChange: (model: string) => void;
		onApiKeyChange: (key: string) => void;
		onForgetKeys: () => void;
		onBaseUrlChange: (url: string) => void;
		onRefresh: () => void;
	}

	let {
		connection,
		providers,
		provider,
		model,
		models,
		modelsNotice,
		loadingModels,
		disabled,
		apiKey,
		baseUrl,
		onConnectionChange,
		onProviderChange,
		onModelChange,
		onApiKeyChange,
		onForgetKeys,
		onBaseUrlChange,
		onRefresh,
	}: Props = $props();

	const current = $derived(providers.find((p) => p.id === provider));
	const direct = $derived(connection === 'direct');
	/** Direct + cloud provider: the user supplies the key. */
	const needsKey = $derived(direct && current?.kind === 'direct');
	/** Direct + local server: the browser needs the URL (and CORS on the server). */
	const needsBaseUrl = $derived(direct && current?.kind === 'local');
	const listId = 'chat-model-options';
</script>

<div class="provider">
	<label>
		<span>Connection</span>
		<select
			value={connection}
			{disabled}
			aria-describedby="chat-connection-hint"
			onchange={(e) => onConnectionChange(e.currentTarget.value as Connection)}
		>
			<option value="server">Server (/api/chat)</option>
			<option value="direct">Direct (browser → provider, BYOK)</option>
		</select>
		<span id="chat-connection-hint" class="hint">{CONNECTION_HINTS[connection]}</span>
	</label>
	<label>
		<span>Provider</span>
		<select
			value={provider}
			{disabled}
			onchange={(e) => onProviderChange(e.currentTarget.value)}
		>
			{#each providers as p (p.id)}
				<option value={p.id} disabled={!p.configured}>
					{p.label}{p.configured ? '' : ` (${p.unavailableLabel ?? 'not configured'})`}
				</option>
			{/each}
		</select>
	</label>
	{#if needsKey}
		<label>
			<span>API key</span>
			<span class="model-row">
				<input
					type="password"
					value={apiKey}
					{disabled}
					placeholder="Paste your {current?.label ?? ''} API key"
					autocomplete="off"
					spellcheck="false"
					oninput={(e) => onApiKeyChange(e.currentTarget.value)}
				/>
				<IconButton label="Forget all keys in this tab" disabled={disabled || !apiKey} tipAlign="end" onclick={onForgetKeys}>
					<Icon name="trash" />
				</IconButton>
			</span>
		</label>
	{/if}
	{#if needsBaseUrl}
		<label>
			<span>Server URL</span>
			<input
				type="url"
				value={baseUrl}
				{disabled}
				placeholder="http://localhost:11434/v1"
				spellcheck="false"
				onchange={(e) => onBaseUrlChange(e.currentTarget.value)}
			/>
		</label>
	{/if}
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
	{#if modelsNotice}
		<p
			class="notice {modelsNotice.level}"
			role={modelsNotice.level === 'error' ? 'alert' : 'status'}
		>
			<svg class="notice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
				{#if modelsNotice.level === 'error'}
					<circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
				{:else}
					<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />
				{/if}
			</svg>
			<span>{modelsNotice.text}</span>
		</p>
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
	label .hint {
		font-size: 0.68rem;
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
	.notice {
		display: flex;
		align-items: flex-start;
		gap: 0.45rem;
		margin: 0;
		padding: 0.5rem 0.6rem;
		border-radius: 6px;
		border: 1px solid;
		font-size: 0.72rem;
		line-height: 1.45;
		white-space: pre-wrap;
		color: var(--fg);
	}
	.notice-icon {
		flex: none;
		width: 16px;
		height: 16px;
		margin-top: 0.05rem;
	}
	.notice.warning {
		border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
		background: color-mix(in srgb, var(--warn) 12%, var(--bg));
	}
	.notice.warning .notice-icon {
		color: var(--warn);
	}
	.notice.error {
		border-color: color-mix(in srgb, var(--err) 55%, var(--border));
		background: color-mix(in srgb, var(--err) 12%, var(--bg));
	}
	.notice.error .notice-icon {
		color: var(--err);
	}
</style>
