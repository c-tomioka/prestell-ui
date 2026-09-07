<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import { type ChatTransport, DefaultChatTransport, type UIMessage } from 'ai';
	import { onMount, tick, untrack } from 'svelte';
	import { validateProposal } from '../../lib/ai/apply';
	import { type ApiKeys, forgetKeys, loadKeys, saveKey } from '../../lib/ai/direct/keys';
	import { directProviders, listDirectLocalModels } from '../../lib/ai/direct/models';
	import { DirectChatTransport } from '../../lib/ai/direct/transport';
	import {
		AUTO_RETRY_DELAY_MS,
		type ChatErrorInfo,
		describeChatError,
		MAX_AUTO_RETRIES,
	} from '../../lib/ai/errors';
	import { extractAstroCode } from '../../lib/ai/extract-code';
	import {
		buildFixPrompt,
		clampFixAttempts,
		MAX_FIX_ATTEMPTS_LIMIT,
		pendingFixAttempts,
	} from '../../lib/ai/fix-loop';
	import { trimForRequest } from '../../lib/ai/history';
	import {
		describeCodedError,
		keyMissingNotice,
		localServerHint,
		NO_LOCAL_MODELS,
	} from '../../lib/ai/messages';
	import {
		CLOUD_MODELS,
		isDirectCloudProvider,
		isLocalProvider,
		isProviderId,
		type ProviderId,
	} from '../../lib/ai/providers-catalog';
	import {
		type ChatSettings,
		type Connection,
		type DocsMode,
		loadSettings,
		saveSettings,
	} from '../../lib/ai/settings';
	import { insertTemplate, type PromptTemplate } from '../../lib/ai/templates';
	import type { Proposal, ProviderInfo } from '../../lib/ai/types';
	import { persistableProposals } from '../../lib/projects/record';
	import { openProjectStore } from '../../lib/projects/store';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import MessageList from './MessageList.svelte';
	import ProviderSelect from './ProviderSelect.svelte';
	import TemplateMenu from './TemplateMenu.svelte';

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
	const isDirect = $derived(settings.connection === 'direct');
	const providerId = $derived<ProviderId>(isProviderId(settings.provider) ? settings.provider : 'ollama');
	/** Page origin, quoted in the CORS instructions for local servers. */
	const origin = typeof location === 'undefined' ? '' : location.origin;

	// --- direct-mode API keys (sessionStorage / memory, never localStorage) ---
	let keys = $state<ApiKeys>({});
	const apiKey = $derived(isDirectCloudProvider(providerId) ? (keys[providerId] ?? '') : '');

	function setApiKey(value: string) {
		if (!isDirectCloudProvider(providerId)) return;
		keys = saveKey(providerId, value);
	}

	function forgetAllKeys() {
		keys = forgetKeys();
	}

	// --- providers / models ---
	/** From `/api/models` (server mode); the direct list is computed locally. */
	let serverProviders = $state<ProviderInfo[]>([]);
	const providers = $derived<ProviderInfo[]>(
		isDirect
			? directProviders({ keys, baseUrls: settings.directBaseUrls, origin })
			: serverProviders,
	);
	let models = $state<string[]>([]);
	/** Model-list notice. `warning` = local server not ready (fixable by the user); `error` = the request itself failed. */
	let modelsNotice = $state<{ level: 'warning' | 'error'; text: string } | null>(null);
	/** Direct mode: the chosen cloud provider has no key yet. */
	const keyNotice = $derived(
		isDirect && isDirectCloudProvider(providerId) && !keys[providerId]
			? { level: 'warning' as const, text: keyMissingNotice(providerId) }
			: null,
	);
	let loadingModels = $state(false);

	/** Move off a provider the current connection cannot use. */
	function ensureUsableProvider() {
		if (!providers.some((p) => p.id === settings.provider && p.configured)) {
			settings.provider = providers.find((p) => p.configured)?.id ?? settings.provider;
		}
	}

	async function loadProviders() {
		if (isDirect) {
			ensureUsableProvider();
			return;
		}
		try {
			const response = await fetch('/api/models');
			const payload = (await response.json()) as { providers?: ProviderInfo[] };
			serverProviders = payload.providers ?? [];
			ensureUsableProvider();
		} catch (error) {
			modelsNotice = {
				level: 'error',
				text: `Could not load providers: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/** Adopt the first listed model when nothing is chosen yet, or when the remembered id no longer exists. */
	function adoptModel(provider: string) {
		const chosen = settings.models[provider];
		if (models[0] && (!chosen || !models.includes(chosen))) {
			settings.models[provider] = models[0];
		}
	}

	async function loadModels() {
		const provider = settings.provider;
		const direct = isDirect;
		loadingModels = true;
		modelsNotice = null;
		try {
			if (direct) {
				await loadDirectModels(provider);
				return;
			}
			const response = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
			const payload = (await response.json()) as
				| { ok: true; models: string[] }
				| { ok: false; error: string; code: 'local-unreachable'; provider: 'ollama' | 'lmstudio' };
			if (provider !== settings.provider || direct !== isDirect) return;
			if (payload.ok) {
				models = payload.models;
				adoptModel(provider);
				if (models.length === 0 && providers.find((p) => p.id === provider)?.kind === 'local') {
					modelsNotice = { level: 'warning', text: NO_LOCAL_MODELS };
				}
			} else {
				models = [];
				modelsNotice = { level: 'warning', text: localServerHint(payload.provider) };
			}
		} catch (error) {
			models = [];
			modelsNotice = { level: 'error', text: error instanceof Error ? error.message : String(error) };
		} finally {
			if (provider === settings.provider) loadingModels = false;
		}
	}

	/** Direct mode: local servers are listed from the browser, cloud lists are static. */
	async function loadDirectModels(provider: string) {
		if (!isProviderId(provider)) return;
		if (isLocalProvider(provider)) {
			const result = await listDirectLocalModels(provider, settings.directBaseUrls[provider], origin);
			if (provider !== settings.provider || !isDirect) return;
			if (result.ok) {
				models = result.models;
				adoptModel(provider);
				if (models.length === 0) modelsNotice = { level: 'warning', text: NO_LOCAL_MODELS };
			} else {
				models = [];
				modelsNotice = { level: 'warning', text: describeCodedError(result.coded) };
			}
			return;
		}
		models = [...CLOUD_MODELS[provider]];
		adoptModel(provider);
	}

	function setProvider(provider: string) {
		settings.provider = provider;
		void loadModels();
	}

	function setConnection(connection: Connection) {
		settings.connection = connection;
		models = [];
		void loadProviders().then(loadModels);
	}

	function setBaseUrl(url: string) {
		if (!isLocalProvider(providerId)) return;
		settings.directBaseUrls[providerId] = url.trim() || settings.directBaseUrls[providerId];
		void loadModels();
	}

	onMount(() => {
		keys = loadKeys();
		void loadProviders().then(loadModels);
	});

	// --- chat ---
	let input = $state('');
	let proposals = $state<Record<string, Proposal>>({});

	const serverTransport = new DefaultChatTransport<UIMessage>({
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
	});
	// Direct mode runs the AI SDK in this tab; the request is read at send time.
	const directTransport = new DirectChatTransport(() => ({
		provider: providerId,
		model,
		docsMode: settings.docsMode,
		filename,
		source: getSource(),
		apiKey: apiKey || undefined,
		baseUrl: isLocalProvider(providerId) ? settings.directBaseUrls[providerId] : undefined,
	}));
	const transport: ChatTransport<UIMessage> = {
		sendMessages: (options) => (isDirect ? directTransport : serverTransport).sendMessages(options),
		reconnectToStream: (options) =>
			(isDirect ? directTransport : serverTransport).reconnectToStream(options),
	};

	const chat = new Chat({
		transport,
		onError: (error) => {
			const info = describeChatError(error);
			lastError = info;
			// One automatic retry for errors that may clear on their own; anything
			// else waits for the user (Retry / Retry with fallback).
			if (info.transient && autoRetries < MAX_AUTO_RETRIES) {
				autoRetries++;
				retryPending = true;
				clearTimeout(retryTimer);
				retryTimer = setTimeout(() => void regenerate(), AUTO_RETRY_DELAY_MS);
			}
		},
		onFinish: ({ message, isAbort, isError }) => {
			if (isAbort || isError) {
				// Keep the "auto-fixing…" card alive while an automatic retry is pending.
				if (!retryPending) settleRetrying('gave-up');
				void persistChat();
				return;
			}
			autoRetries = 0;
			lastError = null;
			void finalizeProposal(message);
		},
	});

	// --- errors, retry, fallback ---
	let lastError = $state<ChatErrorInfo | null>(null);
	/** True from the moment an automatic retry is scheduled until it is sent. */
	let retryPending = $state(false);
	let autoRetries = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;

	const fallbackInfo = $derived(
		providers.find(
			(p) => p.id === settings.fallbackProvider && p.configured && p.id !== settings.provider,
		) ?? null,
	);

	function cancelAutoRetry() {
		clearTimeout(retryTimer);
		retryTimer = undefined;
		retryPending = false;
	}

	/** Re-request the last reply (the AI SDK drops a partial assistant message first). */
	async function regenerate() {
		cancelAutoRetry();
		lastError = null;
		chat.clearError();
		if (chat.messages.length === 0) return;
		await chat.regenerate();
	}

	function retryNow() {
		autoRetries = 0;
		void regenerate();
	}

	async function retryWithFallback() {
		const fallback = fallbackInfo;
		if (!fallback) return;
		settings.provider = fallback.id;
		await loadModels();
		if (!settings.models[fallback.id]) return; // modelsNotice explains why
		autoRetries = 0;
		await regenerate();
	}

	function dismissError() {
		cancelAutoRetry();
		lastError = null;
		chat.clearError();
	}

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
			cancelAutoRetry();
			lastError = null;
			autoRetries = 0;
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
	const canSend = $derived(
		chatReady && !busy && input.trim() !== '' && model.trim() !== '' && keyNotice === null,
	);

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

	const TRUNCATED_ERROR =
		'The reply ended before the code block was closed (output limit reached). Ask for a smaller component or pick a model with a larger output limit.';

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
		if (!extracted.complete) {
			// The reply stopped before the closing fence (output limit reached):
			// re-asking would be cut off the same way, so no auto-fix here.
			proposals[message.id] = { code, status: 'invalid', error: TRUNCATED_ERROR };
			void persistChat();
			return;
		}
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
		cancelAutoRetry();
		lastError = null;
		autoRetries = 0;
		void chat.sendMessage({ text }).finally(() => void persistChat());
	}

	let composerEl: HTMLTextAreaElement | undefined;

	/** Insert a template into the composer and select its first `[...]` placeholder. */
	async function applyTemplate(template: PromptTemplate) {
		const { text, selection } = insertTemplate(input, template);
		input = text;
		await tick();
		if (!composerEl) return;
		composerEl.focus();
		if (selection) composerEl.setSelectionRange(selection.start, selection.end);
		else composerEl.setSelectionRange(text.length, text.length);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send(event);
	}

	function clear() {
		cancelAutoRetry();
		lastError = null;
		autoRetries = 0;
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
			<IconButton label="Clear chat history" disabled={busy || chat.messages.length === 0} onclick={clear}>
				<Icon name="eraser" />
			</IconButton>
			<IconButton label="Close chat panel" tipAlign="end" onclick={onClose}>
				<Icon name="x" />
			</IconButton>
		</div>
	</div>

	<div class="settings">
		<ProviderSelect
			connection={settings.connection}
			{providers}
			provider={settings.provider}
			{model}
			{models}
			modelsNotice={modelsNotice ?? keyNotice}
			{loadingModels}
			disabled={busy}
			{apiKey}
			baseUrl={isLocalProvider(providerId) ? settings.directBaseUrls[providerId] : ''}
			onConnectionChange={setConnection}
			onProviderChange={setProvider}
			onModelChange={(value) => (settings.models[settings.provider] = value)}
			onApiKeyChange={setApiKey}
			onForgetKeys={forgetAllKeys}
			onBaseUrlChange={setBaseUrl}
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
				<span>Fallback</span>
				<select
					value={settings.fallbackProvider}
					disabled={busy}
					aria-label="Fallback provider offered after a failed request"
					onchange={(e) => (settings.fallbackProvider = e.currentTarget.value)}
				>
					<option value="">none</option>
					{#each providers.filter((p) => p.configured) as p (p.id)}
						<option value={p.id}>{p.label}</option>
					{/each}
				</select>
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

	{#if lastError || chat.error}
		<div class="error" role="alert">
			<span>{lastError?.message ?? chat.error?.message}</span>
			<div class="error-actions">
				{#if retryPending}
					<span class="retrying">Retrying…</span>
				{:else}
					<button type="button" class="ghost" onclick={retryNow} disabled={busy}>Retry</button>
					{#if fallbackInfo}
						<button type="button" class="ghost" onclick={() => void retryWithFallback()} disabled={busy}>
							Retry with {fallbackInfo.label}
						</button>
					{/if}
					<button type="button" class="ghost" onclick={dismissError}>Dismiss</button>
				{/if}
			</div>
		</div>
	{/if}

	<form class="composer" onsubmit={send}>
		<label class="visually-hidden" for="chat-input">Message</label>
		<textarea
			id="chat-input"
			bind:this={composerEl}
			bind:value={input}
			rows="3"
			placeholder="Describe the component or the change you want… (⌘/Ctrl+Enter to send)"
			onkeydown={onKeydown}
			disabled={busy}
		></textarea>
		<div class="composer-actions">
			<TemplateMenu disabled={busy} onPick={(template) => void applyTemplate(template)} />
			{#if busy}
				<IconButton label="Stop generating" tipSide="top" onclick={() => chat.stop()}>
					<Icon name="square" />
				</IconButton>
			{/if}
			<IconButton
				label="Send (⌘/Ctrl+Enter)"
				type="submit"
				variant="accent"
				tipSide="top"
				tipAlign="end"
				disabled={!canSend}
			>
				<Icon name="send" />
			</IconButton>
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
		flex-direction: column;
		gap: 0.4rem;
		margin: 0 0.75rem;
		padding: 0.5rem 0.6rem;
		border-radius: 6px;
		background: rgba(248, 113, 113, 0.12);
		color: var(--err);
		font-size: 0.75rem;
		white-space: pre-wrap;
	}
	.error-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.3rem;
	}
	.retrying {
		color: var(--muted);
		align-self: center;
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
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.4rem;
	}
	.composer-actions > :global(.template) {
		margin-right: auto;
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
