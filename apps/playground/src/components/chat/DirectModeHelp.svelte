<!-- "How direct mode works": what leaves the browser, who is billed, where the key lives, how to set up the provider. -->
<script lang="ts">
	import { DIRECT_HELP_TITLE, directHelp } from '../../lib/ai/messages';
	import type { ProviderId } from '../../lib/ai/providers-catalog';

	interface Props {
		provider: ProviderId;
		/** Page origin, quoted in the CORS instruction for local servers. */
		origin: string;
		open: boolean;
		onToggle: (open: boolean) => void;
	}

	let { provider, origin, open, onToggle }: Props = $props();

	const help = $derived(directHelp(provider, origin));
</script>

<details class="help" {open} ontoggle={(e) => onToggle(e.currentTarget.open)}>
	<summary>{DIRECT_HELP_TITLE}</summary>
	<ul>
		{#each help.points as point, index (index)}
			<li>{point}</li>
		{/each}
	</ul>
	{#if help.link}
		<a href={help.link.href} target="_blank" rel="noreferrer">{help.link.label} ↗</a>
	{/if}
</details>

<style>
	.help {
		font-size: 0.7rem;
		line-height: 1.45;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--fg);
	}
	ul {
		margin: 0.35rem 0 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	a {
		display: inline-block;
		margin-top: 0.4rem;
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
</style>
