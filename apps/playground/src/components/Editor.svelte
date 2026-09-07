<!-- Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root. -->
<script lang="ts">
	import type { Diagnostic } from '@codemirror/lint';
	import { onMount, untrack } from 'svelte';
	import {
		createInputEditor,
		type EditorLanguage,
		type InputEditorHandle,
		type Theme,
	} from '../lib/codemirror';

	interface Props {
		value: string;
		diagnostics?: readonly Diagnostic[];
		theme: Theme;
		/** Syntax highlighting for the active file (default: Astro). */
		language?: EditorLanguage;
		onChange: (value: string) => void;
	}

	let { value, diagnostics = [], theme, language = 'astro', onChange }: Props = $props();

	let host: HTMLDivElement;
	let handle: InputEditorHandle | undefined;

	onMount(() => {
		// Initial values only; the `$effect`s below keep them in sync afterwards.
		handle = createInputEditor({
			parent: host,
			doc: untrack(() => value),
			language: untrack(() => language),
			theme: untrack(() => theme),
			ariaLabel: 'Astro source editor',
			onChange,
		});
		return () => handle?.destroy();
	});

	// Sync external value changes (reset, shared-link load) into the editor.
	$effect(() => {
		handle?.setDoc(value);
	});

	// Push compiler diagnostics into the editor's lint state.
	$effect(() => {
		handle?.setDiagnostics(diagnostics);
	});

	// React to theme changes.
	$effect(() => {
		handle?.setTheme(theme);
	});

	// Switch highlighting when another file type becomes active.
	$effect(() => {
		handle?.setLanguage(language);
	});
</script>

<div class="editor-host" bind:this={host}></div>

<style>
	.editor-host {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	/* CodeMirror injects these at runtime, so they must be global. */
	:global(.editor-host .cm-editor) {
		height: 100%;
	}
	:global(.editor-host .cm-scroller) {
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
		font-size: 13px;
		line-height: 1.5;
	}
</style>
