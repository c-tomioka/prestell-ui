<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport, type UIMessage } from 'ai';
	import { onMount, untrack } from 'svelte';
	import { validateProposal } from '../../lib/ai/apply';
	import { extractAstroCode } from '../../lib/ai/extract-code';
	import {
		buildFixPrompt,
		clampFixAttempts,
		MAX_FIX_ATTEMPTS_LIMIT,
		pendingFixAttempts,
	} from '../../lib/ai/fix-loop';
	import { trimForRequest } from '../../lib/ai/history';
	import {
		type ChatSettings,
		type DocsMode,
		loadSettings,
		saveSettings,
	} from '../../lib/ai/settings';
	import type { Proposal, ProviderInfo } from '../../lib/ai/types';
	import { persistableProposals } from '../../lib/projects/record';
	import { openProjectStore } from '../../lib/projects/store';
	import MessageList from './MessageList.svelte';
	import ProviderSelect from './ProviderSelect.svelte';

	interface Props {
		/** Project whose chat thread is shown; switching it swaps the history. */
		projectId: string;
		/** Current editor contents (read at request time so edits are incremental). */
		getSource: () => string;
		filename: string;
		onApply: (code: string) => void;
		onClose: () => void;
	}

	let { projectId, getSource, filename, onApply, onClose }: Props = $props();

	// --- settings (persisted) ---
	let settings = $state<ChatSettings>(loadSettings());
	$effect(() => {
		saveSettings($state.snapshot(settings));
	});
	const model = $derived(settings.models[settings.provider] ?? '');

	// --- providers / models ---
	let providers = $state<ProviderInfo[]>([]);
	let models = $state<string[]>([]);
	let modelsError = $state('');
	let loadingModels = $state(false);

	async function loadProviders() {
		try {
			const response = await fetch('/api/models');
			const payload = (await response.json()) as { providers?: ProviderInfo[] };
			providers = payload.providers ?? [];
			if (!providers.some((p) => p.id === settings.provider && p.configured)) {
				settings.provider = providers.find((p) => p.configured)?.id ?? settings.provider;
			}
		} catch (error) {
			modelsError = `Could not load providers: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	async function loadModels() {
		const provider = settings.provider;
		loadingModels = true;
		modelsError = '';
		try {
			const response = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
			const payload = (await response.json()) as
				| { ok: true; models: string[] }
				| { ok: false; error: string; hint: string };
			if (provider !== settings.provider) return;
			if (payload.ok) {
				models = payload.models;
				// Adopt the first listed model when nothing is chosen yet, or when the
				// remembered id no longer exists on the server (e.g. model was removed).
				const chosen = settings.models[provider];
				if (models[0] && (!chosen || !models.includes(chosen))) {
					settings.models[provider] = models[0];
				}
				if (models.length === 0 && providers.find((p) => p.id === provider)?.kind === 'local') {
					modelsError = 'No models found on the local server. Pull or load a model, then reload.';
				}
			} else {
				models = [];
				modelsError = payload.hint;
			}
		} catch (error) {
			models = [];
			modelsError = error instanceof Error ? error.message : String(error);
		} finally {
			if (provider === settings.provider) loadingModels = false;
		}
	}

	function setProvider(provider: string) {
		settings.provider = provider;
		void loadModels();
	}

	onMount(() => {
		void loadProviders().then(loadModels);
	});

	// --- chat ---
	let input = $state('');
	let proposals = $state<Record<string, Proposal>>({});

	const chat = new Chat({
		transport: new DefaultChatTransport({
			api: '/api/chat',
			body: () => ({
				provider: settings.provider,
				model,
				docsMode: settings.docsMode,
				filename,
				source: getSource(),
			}),
			// The full thread stays in the browser; only a window is sent (server cap).
			prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
				body: { ...body, id, trigger, messageId, messages: trimForRequest(messages) },
			}),
		}),
		onFinish: ({ message, isAbort, isError }) => {
			if (isAbort || isError) {
				settleRetrying('gave-up');
				void persistChat();
				return;
			}
			void finalizeProposal(message);
		},
	});

	// --- per-project history (IndexedDB) ---
	let chatReady = $state(false);
	/** Bumped on every project switch so stale async work is discarded. */
	let generation = 0;
	let loadedProjectId = '';

	$effect(() => {
		const id = projectId;
		// Only a *different* id reloads; chat state is written here, not tracked.
		untrack(() => {
			if (id === loadedProjectId) return;
			loadedProjectId = id;
			const current = ++generation;
			chatReady = false;
			void chat.stop();
			chat.messages = [];
			proposals = {};
			chat.clearError();
			void (async () => {
				let record: Awaited<ReturnType<Awaited<ReturnType<typeof openProjectStore>>['getChat']>>;
				try {
					record = await (await openProjectStore()).getChat(id);
				} catch (error) {
					console.error('[chat] could not load history', error);
				}
				if (current !== generation) return;
				chat.messages = record?.messages ?? [];
				proposals = record?.proposals ?? {};
				chatReady = true;
			})();
		});
	});

	async function persistChat() {
		if (!chatReady) return;
		const record = {
			projectId,
			messages: $state.snapshot(chat.messages) as UIMessage[],
			proposals: persistableProposals($state.snapshot(proposals)),
			updatedAt: Date.now(),
		};
		try {
			await (await openProjectStore()).putChat(record);
		} catch (error) {
			console.error('[chat] could not save history', error);
		}
	}

	const busy = $derived(chat.status === 'submitted' || chat.status === 'streaming');
	const canSend = $derived(chatReady && !busy && input.trim() !== '' && model.trim() !== '');

	function assistantText(message: UIMessage): string {
		return message.parts
			.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
			.map((part) => part.text)
			.join('');
	}

	// While a reply streams, derive a provisional card from the partial text so
	// the code is visible as it arrives. Finalized proposals live in `proposals`.
	const streamingProposal = $derived.by((): [string, Proposal] | null => {
		const last = chat.messages.at(-1);
		if (!last || last.role !== 'assistant' || !busy) return null;
		if (proposals[last.id]) return null;
		const extracted = extractAstroCode(assistantText(last));
		return extracted ? [last.id, { code: extracted.code, status: 'streaming' }] : null;
	});
	const visibleProposals = $derived<Record<string, Proposal>>(
		streamingProposal ? { ...proposals, [streamingProposal[0]]: streamingProposal[1] } : proposals,
	);

	/** The fix request finished (reply, stop, or error): close the card that triggered it. */
	function settleRetrying(state: 'resolved' | 'gave-up') {
		for (const [id, proposal] of Object.entries(proposals)) {
			if (proposal.fix?.state === 'retrying') {
				proposals[id] = { ...proposal, fix: { ...proposal.fix, state } };
			}
		}
	}

	async function finalizeProposal(message: UIMessage) {
		const current = generation;
		settleRetrying('resolved');
		const extracted = extractAstroCode(assistantText(message));
		if (!extracted) {
			// Prose-only reply (answer or question): nothing to validate, and no auto-fix.
			delete proposals[message.id];
			void persistChat();
			return;
		}
		const code = extracted.code;
		proposals[message.id] = { code, status: 'validating' };
		const result = await validateProposal(code, { filename });
		if (current !== generation) return;
		if (result.ok) {
			proposals[message.id] = { code, status: 'valid', warnings: result.warnings };
			if (settings.autoApply) applyProposal(message.id);
			else void persistChat();
			return;
		}

		// Fix loop: hand the validation errors back to the model, up to the limit.
		const attempts = pendingFixAttempts(chat.messages);
		const max = settings.maxFixAttempts;
		if (settings.autoFix && attempts < max) {
			const attempt = attempts + 1;
			proposals[message.id] = {
				code,
				status: 'invalid',
				error: result.error,
				fix: { attempt, max, state: 'retrying' },
			};
			await persistChat();
			if (current !== generation) return;
			void chat.sendMessage({
				text: buildFixPrompt(result.error, attempt, max),
				metadata: { kind: 'fix', attempt, max },
			});
			return;
		}
		proposals[message.id] = {
			code,
			status: 'invalid',
			error: result.error,
			fix: attempts > 0 ? { attempt: attempts, max, state: 'gave-up' } : undefined,
		};
		void persistChat();
	}

	function applyProposal(messageId: string) {
		const proposal = proposals[messageId];
		if (!proposal) return;
		onApply(proposal.code);
		proposals[messageId] = { ...proposal, status: 'applied' };
		void persistChat();
	}

	function send(event?: Event) {
		event?.preventDefault();
		if (!canSend) return;
		const text = input.trim();
		input = '';
		void chat.sendMessage({ text }).finally(() => void persistChat());
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send(event);
	}

	function clear() {
		chat.messages = [];
		proposals = {};
		chat.clearError();
		void persistChat();
	}
</script>

<section class="chat" aria-label="AI chat">
	<div class="chat-head">
		<span class="title">AI chat</span>
		<div class="head-actions">
			<button type="button" class="ghost" onclick={clear} disabled={busy || chat.messages.length === 0}>Clear</button>
			<button type="button" class="ghost" aria-label="Close chat panel" onclick={onClose}>✕</button>
		</div>
	</div>

	<div class="settings">
		<ProviderSelect
			{providers}
			provider={settings.provider}
			{model}
			{models}
			{modelsError}
			{loadingModels}
			disabled={busy}
			onProviderChange={setProvider}
			onModelChange={(value) => (settings.models[settings.provider] = value)}
			onRefresh={loadModels}
		/>
		<div class="toggles">
			<label>
				<input type="checkbox" bind:checked={settings.autoApply} />
				<span>Auto-apply valid proposals</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={settings.autoFix} />
				<span>Auto-fix errors, up to</span>
				<input
					class="attempts"
					type="number"
					min="1"
					max={MAX_FIX_ATTEMPTS_LIMIT}
					value={settings.maxFixAttempts}
					disabled={!settings.autoFix || busy}
					aria-label="Maximum auto-fix attempts"
					onchange={(e) => (settings.maxFixAttempts = clampFixAttempts(e.currentTarget.valueAsNumber))}
				/>
				<span>tries</span>
			</label>
			<label>
				<span>Astro docs</span>
				<select
					value={settings.docsMode}
					disabled={busy}
					onchange={(e) => (settings.docsMode = e.currentTarget.value as DocsMode)}
				>
					<option value="off">off</option>
					<option value="inject">inject (search first)</option>
					<option value="tools">tools (tool calling)</option>
				</select>
			</label>
		</div>
	</div>

	<MessageList messages={chat.messages} proposals={visibleProposals} streaming={busy} onApply={applyProposal} />

	{#if chat.error}
		<div class="error" role="alert">
			<span>{chat.error.message}</span>
			<button type="button" class="ghost" onclick={() => chat.clearError()}>Dismiss</button>
		</div>
	{/if}

	<form class="composer" onsubmit={send}>
		<label class="visually-hidden" for="chat-input">Message</label>
		<textarea
			id="chat-input"
			bind:value={input}
			rows="3"
			placeholder="Describe the component or the change you want… (⌘/Ctrl+Enter to send)"
			onkeydown={onKeydown}
			disabled={busy}
		></textarea>
		<div class="composer-actions">
			{#if busy}
				<button type="button" class="ghost" onclick={() => chat.stop()}>Stop</button>
			{/if}
			<button type="submit" class="send" disabled={!canSend}>Send</button>
		</div>
	</form>
</section>

<style>
	.chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		border-left: 1px solid var(--border);
		background: var(--bg);
	}
	.chat-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 40px;
		flex: none;
		padding: 0 0.75rem;
		border-bottom: 1px solid var(--border);
		background: var(--panel);
		font-size: 0.78rem;
	}
	.title {
		font-weight: 600;
	}
	.head-actions {
		display: flex;
		gap: 0.3rem;
	}
	.settings {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.toggles label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.toggles .attempts {
		width: 3rem;
		font: inherit;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.1rem 0.25rem;
	}
	.toggles select {
		font-size: 0.72rem;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.15rem 0.3rem;
	}
	.error {
		flex: none;
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0 0.75rem;
		padding: 0.5rem 0.6rem;
		border-radius: 6px;
		background: rgba(248, 113, 113, 0.12);
		color: var(--err);
		font-size: 0.75rem;
		white-space: pre-wrap;
	}
	.composer {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.6rem 0.75rem;
		border-top: 1px solid var(--border);
		background: var(--panel);
	}
	textarea {
		width: 100%;
		resize: vertical;
		min-height: 3.5rem;
		font: inherit;
		font-size: 0.8rem;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.45rem 0.55rem;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}
	.composer-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
	}
	button {
		appearance: none;
		cursor: pointer;
		font-size: 0.74rem;
		border-radius: 6px;
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--border);
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.ghost {
		background: transparent;
		color: var(--muted);
	}
	.ghost:not(:disabled):hover {
		color: var(--fg);
	}
	.send {
		background: var(--accent);
		color: var(--on-accent);
		border-color: transparent;
		font-weight: 600;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
