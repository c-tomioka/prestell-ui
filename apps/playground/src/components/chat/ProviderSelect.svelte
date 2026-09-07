<script lang="ts">
	import { isProviderId, type ProviderId } from '../../lib/ai/providers-catalog';
	import type { Connection } from '../../lib/ai/settings';
	import type { ProviderInfo } from '../../lib/ai/types';
	import { t } from '../../lib/i18n';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import DirectModeHelp from './DirectModeHelp.svelte';

	interface Props {
		/** `server` = through /api/chat; `direct` = browser → provider (BYOK). */
		connection: Connection;
		/** True when the build offers only this connection (static host): no switch. */
		connectionLocked: boolean;
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
		/** Page origin, for the local-server CORS instruction in the help panel. */
		origin: string;
		/** "How direct mode works" panel state (persisted). */
		helpOpen: boolean;
		onHelpToggle: (open: boolean) => void;
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
		connectionLocked,
		providers,
		provider,
		model,
		models,
		modelsNotice,
		loadingModels,
		disabled,
		apiKey,
		baseUrl,
		origin,
		helpOpen,
		onHelpToggle,
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
	const providerId = $derived<ProviderId>(isProviderId(provider) ? provider : 'ollama');
	const listId = 'chat-model-options';
	const connectionLabel = $derived(
		connection === 'direct' ? $t('provider.direct') : $t('provider.server'),
	);
	const connectionHint = $derived(
		connection === 'direct' ? $t('provider.hint.direct') : $t('provider.hint.server'),
	);
	const keyStatus = $derived.by(() => {
		const trimmed = apiKey.trim();
		if (!trimmed) return $t('provider.keyNote');
		return trimmed.length < 12
			? $t('provider.keySavedShort')
			: $t('provider.keySaved', { tail: trimmed.slice(-4) });
	});
</script>

<div class="provider">
	{#if connectionLocked}
		<p class="hint">
			<span class="locked-label">{connectionLabel}</span>
			{connectionHint}
		</p>
	{:else}
		<label>
			<span>{$t('provider.connection')}</span>
			<select
				value={connection}
				{disabled}
				aria-describedby="chat-connection-hint"
				onchange={(e) => onConnectionChange(e.currentTarget.value as Connection)}
			>
				<option value="server">{$t('provider.server')}</option>
				<option value="direct">{$t('provider.direct')}</option>
			</select>
			<span id="chat-connection-hint" class="hint">{connectionHint}</span>
		</label>
	{/if}
	<label>
		<span>{$t('provider.provider')}</span>
		<select
			value={provider}
			{disabled}
			onchange={(e) => onProviderChange(e.currentTarget.value)}
		>
			{#each providers as p (p.id)}
				<option value={p.id} disabled={!p.configured}>
					{p.label}{p.configured
						? ''
						: ` (${p.unavailable === 'server-only' ? $t('provider.serverOnly') : $t('provider.notConfigured')})`}
				</option>
			{/each}
		</select>
	</label>
	{#if direct}
		<DirectModeHelp provider={providerId} {origin} open={helpOpen} onToggle={onHelpToggle} />
	{/if}
	{#if needsKey}
		<label>
			<span>{$t('provider.apiKey')}</span>
			<span class="model-row">
				<input
					type="password"
					value={apiKey}
					{disabled}
					placeholder={$t('provider.keyPlaceholder', { provider: current?.label ?? '' })}
					autocomplete="off"
					spellcheck="false"
					oninput={(e) => onApiKeyChange(e.currentTarget.value)}
				/>
				<IconButton label={$t('provider.forgetKeys')} disabled={disabled || !apiKey} tipAlign="end" onclick={onForgetKeys}>
					<Icon name="trash" />
				</IconButton>
			</span>
			<span class="hint" role="status">{keyStatus}</span>
		</label>
	{/if}
	{#if needsBaseUrl}
		<label>
			<span>{$t('provider.serverUrl')}</span>
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
		<span>{$t('provider.model')}</span>
		<span class="model-row">
			<input
				list={listId}
				value={model}
				{disabled}
				placeholder={loadingModels ? $t('provider.loadingModels') : $t('provider.modelPlaceholder')}
				spellcheck="false"
				oninput={(e) => onModelChange(e.currentTarget.value)}
			/>
			<datalist id={listId}>
				{#each models as m (m)}<option value={m}></option>{/each}
			</datalist>
			<button type="button" class="ghost" title={$t('provider.reloadModels')} aria-label={$t('provider.reloadModels')} onclick={onRefresh} {disabled}>↻</button>
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
	.locked-label {
		display: block;
		color: var(--fg);
		font-weight: 600;
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
