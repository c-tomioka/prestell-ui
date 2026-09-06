<script lang="ts">
	import type { UIMessage } from 'ai';
	import { tick } from 'svelte';
	import { stripAstroFences } from '../../lib/ai/extract-code';
	import { fixMetadataOf } from '../../lib/ai/fix-loop';
	import type { ChatNotice, Proposal } from '../../lib/ai/types';
	import CodeProposal from './CodeProposal.svelte';

	interface Props {
		messages: UIMessage[];
		proposals: Record<string, Proposal>;
		streaming: boolean;
		onApply: (messageId: string) => void;
	}

	let { messages, proposals, streaming, onApply }: Props = $props();

	let host: HTMLDivElement;

	function textOf(message: UIMessage): string {
		return message.parts
			.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
			.map((part) => part.text)
			.join('');
	}

	function toolParts(message: UIMessage) {
		return message.parts.filter(
			(part) => part.type === 'dynamic-tool' || part.type.startsWith('tool-'),
		) as Array<{ type: string; toolName?: string; state?: string; input?: unknown }>;
	}

	function noticeParts(message: UIMessage): ChatNotice[] {
		return message.parts
			.filter((part) => part.type === 'data-notice')
			.map((part) => (part as { data: ChatNotice }).data);
	}

	function toolLabel(part: { type: string; toolName?: string; input?: unknown }): string {
		const name = part.toolName ?? part.type.replace(/^tool-/, '');
		const input = part.input as { query?: unknown } | undefined;
		return typeof input?.query === 'string' ? `${name}: “${input.query}”` : name;
	}

	// Keep the newest message in view while streaming.
	$effect(() => {
		void messages.length;
		void streaming;
		void tick().then(() => host?.scrollTo({ top: host.scrollHeight }));
	});
</script>

<div class="messages" bind:this={host}>
	{#if messages.length === 0}
		<p class="empty">
			Describe the component you want — e.g. “A pricing section with three tiers and a highlighted middle plan” — or pick a template next to the Send button.
			The reply is validated with the Astro compiler before it replaces the editor.
		</p>
	{/if}
	{#each messages as message (message.id)}
		{@const text = textOf(message)}
		{@const proposal = proposals[message.id]}
		{@const fix = message.role === 'user' ? fixMetadataOf(message) : null}
		{#if fix}
			<article class="message fix" data-role="user" data-kind="fix">
				<details>
					<summary>🔧 Auto-fix request {fix.attempt}/{fix.max}</summary>
					<pre class="fix-body">{text}</pre>
				</details>
			</article>
		{:else}
		<article class="message" data-role={message.role}>
			<header>{message.role === 'user' ? 'You' : 'Assistant'}</header>
			{#each noticeParts(message) as notice, index (index)}
				<p class="tool notice">ℹ️ {notice.message}</p>
			{/each}
			{#each toolParts(message) as part, index (index)}
				<p class="tool">🔎 {toolLabel(part)}{part.state && part.state !== 'output-available' ? ` (${part.state})` : ''}</p>
			{/each}
			{#if message.role === 'assistant' && proposal}
				{@const prose = stripAstroFences(text)}
				{#if prose}<p class="text">{prose}</p>{/if}
				<CodeProposal {proposal} onApply={() => onApply(message.id)} />
			{:else if text}
				<p class="text">{text}</p>
			{/if}
		</article>
		{/if}
	{/each}
	{#if streaming && messages.at(-1)?.role !== 'assistant'}
		<p class="thinking" role="status">Thinking…</p>
	{/if}
</div>

<style>
	.messages {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.empty,
	.thinking {
		margin: 0;
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.message {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.8rem;
		line-height: 1.5;
	}
	.message[data-role='user'] {
		padding: 0.5rem 0.7rem;
		border-radius: 8px;
		background: color-mix(in srgb, var(--accent) 12%, var(--panel));
	}
	header {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	.text {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.tool {
		margin: 0;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.fix {
		font-size: 0.72rem;
		color: var(--muted);
	}
	.fix summary {
		cursor: pointer;
	}
	.fix-body {
		margin: 0.3rem 0 0;
		padding: 0.4rem 0.5rem;
		max-height: 10rem;
		overflow: auto;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.68rem;
		line-height: 1.4;
		white-space: pre-wrap;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--panel);
	}
</style>
