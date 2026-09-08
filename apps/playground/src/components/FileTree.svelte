<!-- File tree for Page / Site projects (left of the editor). Pure display + callbacks; the file map lives in Playground. -->
<script lang="ts">
	import { t } from '../lib/i18n';
	import { buildFileTree, type FileTreeNode } from '../lib/projects/files';
	import type { ProjectFile } from '../lib/projects/types';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';

	interface Props {
		files: Record<string, ProjectFile>;
		activePath: string;
		entry: string;
		collapsed: boolean;
		onOpen: (path: string) => void;
		onAdd: () => void;
		onUpload: (files: FileList) => void;
		onRename: (path: string) => void;
		onDelete: (path: string) => void;
		onToggle: () => void;
	}

	let {
		files,
		activePath,
		entry,
		collapsed,
		onOpen,
		onAdd,
		onUpload,
		onRename,
		onDelete,
		onToggle,
	}: Props = $props();

	let uploadInput: HTMLInputElement | undefined;

	function onUploadChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (input.files && input.files.length > 0) onUpload(input.files);
		input.value = '';
	}

	const tree = $derived(buildFileTree(files));
</script>

{#snippet node(item: FileTreeNode, depth: number)}
	{#if item.children}
		<li class="folder">
			<span class="row" style="--depth: {depth}">
				<Icon name="folder" size={14} />
				<span class="name">{item.name}</span>
			</span>
			<ul>
				{#each item.children as child (child.path)}
					{@render node(child, depth + 1)}
				{/each}
			</ul>
		</li>
	{:else}
		<li>
			<span class="row file" class:active={item.path === activePath} style="--depth: {depth}">
				<button
					type="button"
					class="open"
					aria-current={item.path === activePath ? 'true' : undefined}
					onclick={() => onOpen(item.path)}
					title={item.path}
				>
					<Icon name="file" size={14} />
					<span class="name">{item.name}</span>
					{#if item.path === entry}
						<span class="entry" title={$t('files.entryTitle')}>{$t('files.entryBadge')}</span>
					{/if}
				</button>
				<span class="row-actions">
					<button
						type="button"
						class="mini"
						aria-label={$t('files.rename')}
						title={$t('files.rename')}
						onclick={() => onRename(item.path)}
					>
						<Icon name="pencil" size={12} />
					</button>
					<button
						type="button"
						class="mini"
						aria-label={$t('files.delete')}
						title={$t('files.delete')}
						onclick={() => onDelete(item.path)}
					>
						<Icon name="trash" size={12} />
					</button>
				</span>
			</span>
		</li>
	{/if}
{/snippet}

<aside class="tree" class:collapsed aria-label={$t('files.title')}>
	<div class="head">
		{#if !collapsed}
			<span class="title">{$t('files.title')}</span>
			<IconButton label={$t('files.add')} onclick={onAdd}>
				<Icon name="file-plus" />
			</IconButton>
			<IconButton label={$t('files.upload')} onclick={() => uploadInput?.click()}>
				<Icon name="image" />
			</IconButton>
			<input
				class="visually-hidden"
				type="file"
				accept="image/*"
				multiple
				tabindex="-1"
				aria-hidden="true"
				bind:this={uploadInput}
				onchange={onUploadChange}
			/>
		{/if}
		<IconButton
			label={collapsed ? $t('files.expand') : $t('files.collapse')}
			tipAlign={collapsed ? 'center' : 'end'}
			onclick={onToggle}
		>
			<Icon name={collapsed ? 'chevron-right' : 'chevron-left'} />
		</IconButton>
	</div>
	{#if !collapsed}
		<ul class="root">
			{#each tree as item (item.path)}
				{@render node(item, 0)}
			{/each}
		</ul>
	{/if}
</aside>

<style>
	.tree {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border-right: 1px solid var(--border);
		background: var(--panel);
		font-size: 0.78rem;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem;
		height: 40px;
		flex: none;
		padding: 0 0.35rem 0 0.6rem;
		border-bottom: 1px solid var(--border);
		color: var(--muted);
	}
	.collapsed .head {
		justify-content: center;
		padding: 0;
	}
	.title {
		flex: 1;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.root {
		flex: 1;
		overflow: auto;
		padding: 0.3rem 0;
	}
	.row {
		display: flex;
		align-items: center;
		min-height: 1.6rem;
		padding-left: calc(0.5rem + var(--depth, 0) * 0.85rem);
		color: var(--muted);
		white-space: nowrap;
	}
	.folder > .row {
		gap: 0.35rem;
	}
	.row.file {
		padding-left: 0;
	}
	.row.file:hover,
	.row.file.active {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}
	.row.file.active {
		color: var(--fg);
	}
	.open {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		padding: 0 0.35rem 0 calc(0.5rem + var(--depth, 0) * 0.85rem);
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.open:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.entry {
		margin-left: 0.25rem;
		padding: 0 0.35rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.row-actions {
		display: none;
		flex: none;
		gap: 0.1rem;
		padding-right: 0.25rem;
	}
	.row.file:hover .row-actions,
	.row.file:focus-within .row-actions {
		display: inline-flex;
	}
	.mini {
		display: inline-grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.mini:hover,
	.mini:focus-visible {
		color: var(--fg);
		background: var(--border);
		outline: none;
	}
</style>
