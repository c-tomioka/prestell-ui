<script lang="ts">
	import type { Proposal } from '../../lib/ai/types';

	interface Props {
		proposal: Proposal;
		onApply: () => void;
	}

	let { proposal, onApply }: Props = $props();

	let expanded = $state(false);
	const lineCount = $derived(proposal.code.split('\n').length);
	const retrying = $derived(proposal.fix?.state === 'retrying');
	const label = $derived.by(() => {
		switch (proposal.status) {
			case 'streaming':
				return 'Generating…';
			case 'validating':
				return 'Validating…';
			case 'valid':
				return 'Ready to apply';
			case 'applied':
				return 'Applied to editor';
			default: {
				const fix = proposal.fix;
				if (!fix) return 'Cannot render';
				if (fix.state === 'retrying') return `Cannot render · auto-fixing ${fix.attempt}/${fix.max}…`;
				if (fix.state === 'resolved') return `Cannot render · retried (${fix.attempt}/${fix.max})`;
				return `Cannot render · auto-fix gave up (${fix.attempt}/${fix.max})`;
			}
		}
	});
</script>

<div class="proposal" data-status={proposal.status}>
	<div class="head">
		<span class="title">Component proposal</span>
		<span class="meta">{lineCount} lines · {label}</span>
	</div>
	{#if proposal.error}
		<pre class="error" role="alert">{proposal.error}</pre>
	{/if}
	{#if proposal.warnings && proposal.warnings.length > 0}
		<pre class="warning">{proposal.warnings.join('\n')}</pre>
	{/if}
	<pre class="code" class:expanded>{proposal.code}</pre>
	<div class="actions">
		<button type="button" class="ghost" onclick={() => (expanded = !expanded)}>
			{expanded ? 'Collapse' : 'Expand'}
		</button>
		<button
			type="button"
			class="apply"
			disabled={proposal.status === 'streaming' || proposal.status === 'validating' || retrying}
			onclick={onApply}
		>
			{proposal.status === 'applied' ? 'Apply again' : proposal.status === 'invalid' ? 'Apply anyway' : 'Apply'}
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
