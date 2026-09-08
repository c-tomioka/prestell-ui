<script lang="ts">
	import type { Proposal } from '../../lib/ai/types';
	import { t } from '../../lib/i18n';

	interface Props {
		proposal: Proposal;
		onApply: () => void;
	}

	let { proposal, onApply }: Props = $props();

	let expanded = $state(false);
	/** Page / Site proposals: which file is shown. */
	let selectedPath = $state<string | null>(null);
	const files = $derived(proposal.files ?? []);
	const shown = $derived(
		files.find((file) => file.path === selectedPath) ?? files[0] ?? { path: '', code: proposal.code },
	);
	const lineCount = $derived(shown.code.split('\n').length);
	const retrying = $derived(proposal.fix?.state === 'retrying');
	const label = $derived.by(() => {
		switch (proposal.status) {
			case 'streaming':
				return $t('proposal.generating');
			case 'validating':
				return $t('proposal.validating');
			case 'valid':
				return $t('proposal.ready');
			case 'applied':
				return $t('proposal.applied');
			default: {
				const fix = proposal.fix;
				if (!fix) return $t('proposal.cannotRender');
				const params = { attempt: fix.attempt, max: fix.max };
				if (fix.state === 'retrying') return $t('proposal.fixing', params);
				if (fix.state === 'resolved') return $t('proposal.retried', params);
				return $t('proposal.gaveUp', params);
			}
		}
	});
</script>

<div class="proposal" data-status={proposal.status}>
	<div class="head">
		<span class="title">{files.length > 0 ? $t('proposal.projectTitle') : $t('proposal.title')}</span>
		<span class="meta">
			{#if files.length > 0}{$t('proposal.files', { count: files.length })} · {/if}{$t('proposal.lines', { count: lineCount })} · {label}
		</span>
	</div>
	{#if files.length > 0}
		<div class="files" role="tablist">
			{#each files as file (file.path)}
				<button
					type="button"
					role="tab"
					class="file"
					class:selected={file.path === shown.path}
					aria-selected={file.path === shown.path}
					title={file.path}
					onclick={() => (selectedPath = file.path)}
				>
					{file.path}
				</button>
			{/each}
		</div>
	{/if}
	{#if proposal.error}
		<pre class="error" role="alert">{proposal.error}</pre>
	{/if}
	{#if proposal.warnings && proposal.warnings.length > 0}
		<pre class="warning">{proposal.warnings.join('\n')}</pre>
	{/if}
	<pre class="code" class:expanded>{shown.code}</pre>
	<div class="actions">
		<button type="button" class="ghost" onclick={() => (expanded = !expanded)}>
			{expanded ? $t('proposal.collapse') : $t('proposal.expand')}
		</button>
		<button
			type="button"
			class="apply"
			disabled={proposal.status === 'streaming' || proposal.status === 'validating' || retrying}
			onclick={onApply}
		>
			{proposal.status === 'applied'
				? $t('proposal.applyAgain')
				: proposal.status === 'invalid'
					? $t('proposal.applyAnyway')
					: $t('proposal.apply')}
		</button>
	</div>
</div>

<style>
	.proposal {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--panel);
		overflow: hidden;
		font-size: 0.75rem;
	}
	.proposal[data-status='valid'],
	.proposal[data-status='applied'] {
		border-color: color-mix(in srgb, var(--ok) 60%, var(--border));
	}
	.proposal[data-status='invalid'] {
		border-color: color-mix(in srgb, var(--err) 60%, var(--border));
	}
	.head {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--border);
	}
	.files {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		padding: 0.35rem 0.6rem;
		border-bottom: 1px solid var(--border);
	}
	.file {
		appearance: none;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.68rem;
		padding: 0.1rem 0.5rem;
		cursor: pointer;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file.selected {
		color: var(--fg);
		border-color: var(--accent);
	}
	.title {
		font-weight: 600;
	}
	.meta {
		color: var(--muted);
	}
	pre {
		margin: 0;
		padding: 0.5rem 0.6rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.72rem;
		line-height: 1.45;
		white-space: pre;
		overflow: auto;
	}
	.code {
		max-height: 9rem;
		background: var(--bg);
	}
	.code.expanded {
		max-height: 60vh;
	}
	.error {
		color: var(--err);
		white-space: pre-wrap;
	}
	.warning {
		color: #fbbf24;
		white-space: pre-wrap;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
		padding: 0.4rem 0.6rem;
		border-top: 1px solid var(--border);
	}
	button {
		appearance: none;
		cursor: pointer;
		font-size: 0.72rem;
		border-radius: 6px;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--border);
	}
	.ghost {
		background: transparent;
		color: var(--muted);
	}
	.ghost:hover {
		color: var(--fg);
	}
	.apply {
		background: var(--accent);
		color: var(--on-accent);
		border-color: transparent;
		font-weight: 600;
	}
	.apply:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
