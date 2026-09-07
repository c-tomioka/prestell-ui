<!-- Square icon button with a hover/focus tooltip. `label` doubles as the accessible name. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Tooltip text and accessible name. */
		label: string;
		type?: 'button' | 'submit';
		variant?: 'ghost' | 'accent';
		/** Toggle state (renders aria-pressed and the active outline). */
		active?: boolean;
		disabled?: boolean;
		/** Keep the tooltip visible without hover, e.g. for "Copied!" feedback. */
		showTip?: boolean;
		/** Where the tooltip opens relative to the button. */
		tipSide?: 'top' | 'bottom';
		/** Horizontal anchor of the tooltip; use `end` for buttons at the right edge. */
		tipAlign?: 'center' | 'end';
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
	}

	let {
		label,
		type = 'button',
		variant = 'ghost',
		active,
		disabled = false,
		showTip = false,
		tipSide = 'bottom',
		tipAlign = 'center',
		onclick,
		children,
	}: Props = $props();
</script>

<!-- The tooltip lives on the wrapper so it still shows while the button is disabled. -->
<span class="wrap tip-{tipSide} align-{tipAlign}" class:show-tip={showTip} data-tip={label}>
	<button
		{type}
		class="icon-button {variant}"
		class:active
		aria-label={label}
		aria-pressed={active === undefined ? undefined : active}
		{disabled}
		{onclick}
	>
		{@render children()}
	</button>
</span>

<style>
	.wrap {
		position: relative;
		display: inline-flex;
		flex: none;
	}
	.icon-button {
		appearance: none;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border-radius: 6px;
		border: 1px solid var(--border);
	}
	.icon-button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.ghost {
		background: transparent;
		color: var(--muted);
	}
	.ghost:not(:disabled):hover,
	.ghost.active {
		color: var(--fg);
	}
	.ghost:not(:disabled):hover {
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}
	.ghost.active {
		border-color: var(--accent);
	}
	.accent {
		background: var(--accent);
		color: var(--on-accent);
		border-color: transparent;
	}
	.accent:not(:disabled):hover {
		filter: brightness(1.08);
	}

	/* Tooltip */
	.wrap::after {
		content: attr(data-tip);
		position: absolute;
		z-index: 20;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		background: var(--fg);
		color: var(--bg);
		font-size: 0.7rem;
		font-weight: 500;
		line-height: 1.2;
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.12s ease 0.05s;
	}
	.wrap:hover::after,
	.wrap:has(:focus-visible)::after,
	.wrap.show-tip::after {
		opacity: 1;
	}
	.tip-bottom::after {
		top: calc(100% + 6px);
	}
	.tip-top::after {
		bottom: calc(100% + 6px);
	}
	.align-center::after {
		left: 50%;
		transform: translateX(-50%);
	}
	.align-end::after {
		right: 0;
	}
</style>
