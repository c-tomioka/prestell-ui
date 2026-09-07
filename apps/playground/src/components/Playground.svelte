<!-- biome-ignore-all lint/a11y/useValidAriaValues: bug in biome -->
<!-- Derived from withastro/astro-playground (MIT). See THIRD_PARTY_NOTICES.md at the repository root. -->
<script lang="ts">
	import type { CompileResult } from '@astrojs/compiler-binding';
	import { onDestroy } from 'svelte';
	import { loadSettings, saveSettings } from '../lib/ai/settings';
	import { compiler } from '../lib/compiler';
	import type { ParsedAst } from '../lib/compiler-protocol';
	import { COMPILE_DEBOUNCE_MS, PREVIEW_DEBOUNCE_MS, PROJECT_SAVE_DEBOUNCE_MS } from '../lib/config';
	import { toCodeMirrorDiagnostics } from '../lib/diagnostics';
	import { saveComponent } from '../lib/export';
	import { t } from '../lib/i18n';
	import { DEFAULT_COMPILE_OPTIONS } from '../lib/options';
	import {
		createPreviewDocument,
		preview,
		validatePreview,
	} from '../lib/preview';
	import { loadAutoPreview, saveAutoPreview } from '../lib/preview-settings';
	import { resolveInitialProject } from '../lib/projects/boot';
	import { loadCurrentProjectId, saveCurrentProjectId } from '../lib/projects/current';
	import { defaultProjectName, importedProjectName } from '../lib/projects/naming';
	import { createProjectRecord, sortByUpdated, toSummary } from '../lib/projects/record';
	import { openProjectStore } from '../lib/projects/store';
	import type { ProjectRecord, ProjectStore, ProjectSummary } from '../lib/projects/types';
	import { DEFAULT_SOURCE } from '../lib/samples';
	import {
		pickShareableOptions,
		readSharedState,
		type ShareableOptions,
		shareUrl,
	} from '../lib/share';
	import { applyTheme, initialTheme, type Theme } from '../lib/theme';
	import ChatPanel from './chat/ChatPanel.svelte';
	import Editor from './Editor.svelte';
	import OutputTabs from './OutputTabs.svelte';
	import Toolbar, { type SaveFeedback, type ShareFeedback } from './Toolbar.svelte';

	const shared = readSharedState();
	let source = $state(shared?.code ?? DEFAULT_SOURCE);
	let options = $state({ ...DEFAULT_COMPILE_OPTIONS, ...(shared?.options ?? {}) });

	let theme = $state<Theme>(initialTheme());
	// Ensure theme application reacts to changes (avoids stale capture warning)
	$effect(() => {
		applyTheme(theme);
	});

	let result = $state<CompileResult | null>(null);
	let ast = $state<ParsedAst | null>(null);
	let status = $state<'loading' | 'compiling' | 'ready' | 'error'>('loading');
	let errorMessage = $state('');
	let compileMs = $state(0);
	let shareFeedback = $state<ShareFeedback>('idle');
	let saveFeedback = $state<SaveFeedback>('idle');
	let previewActive = $state(true);
	/** Whether generated code runs outside this origin; re-read after each render (the sandbox may fall back). */
	let previewIsolated = $state(preview.isolated);
	let previewStatus = $state<'idle' | 'rendering' | 'ready' | 'error' | 'unsupported'>(
		'idle',
	);
	let previewDocument = $state('');
	let previewError = $state('');
	/** Render the preview automatically after each edit (false = manual ↻ only). */
	let autoPreview = $state(loadAutoPreview());
	/** True when the source changed since the last successful render. */
	let previewStale = $state(false);
	/** One-shot: render after the next compile even when Auto is off (AI apply). */
	let renderAfterCompile = false;
	$effect(() => {
		saveAutoPreview(autoPreview);
	});

	const diagnostics = $derived(
		result ? toCodeMirrorDiagnostics(source, result.diagnostics) : [],
	);

	// --- projects (IndexedDB) ---
	// The URL hash is no longer rewritten on every edit; `share()` builds it on demand
	// and a `#code=` URL is imported as a new project on load (see bootProjects).
	let store: ProjectStore | null = null;
	let projects = $state<ProjectSummary[]>([]);
	let currentProject = $state<ProjectSummary | null>(null);
	/** Primitive id so children re-run only on an actual switch, not on every summary update. */
	const currentProjectId = $derived(currentProject?.id ?? null);
	let projectsReady = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	/** What the store holds for the current project; edits are saved only when they differ. */
	let savedSource = '';
	let savedOptionsKey = '';

	function optionsKey(shareable: Partial<ShareableOptions>): string {
		return JSON.stringify(shareable);
	}

	async function saveProject(nextSource: string, nextOptions: Partial<ShareableOptions>) {
		if (!store || !currentProject) return;
		const project = currentProject;
		const now = Date.now();
		const record: ProjectRecord = {
			id: project.id,
			name: project.name,
			createdAt: project.createdAt,
			updatedAt: now,
			source: nextSource,
			options: nextOptions,
			schemaVersion: 1,
		};
		try {
			await store.put(record);
		} catch (error) {
			console.error('[projects] save failed', error);
			return;
		}
		savedSource = nextSource;
		savedOptionsKey = optionsKey(nextOptions);
		if (currentProject?.id === project.id) {
			currentProject = { ...project, updatedAt: now };
			projects = sortByUpdated(projects.map((p) => (p.id === project.id ? { ...p, updatedAt: now } : p)));
		}
	}

	/** Write any pending edit immediately (before switching projects or leaving the page). */
	function flushSave(): Promise<void> {
		if (saveTimer === undefined) return Promise.resolve();
		clearTimeout(saveTimer);
		saveTimer = undefined;
		return saveProject(source, pickShareableOptions($state.snapshot(options)));
	}

	$effect(() => {
		const nextSource = source;
		const nextOptions = pickShareableOptions($state.snapshot(options));
		if (!projectsReady || !currentProject) return;
		if (nextSource === savedSource && optionsKey(nextOptions) === savedOptionsKey) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = undefined;
			void saveProject(nextSource, nextOptions);
		}, PROJECT_SAVE_DEBOUNCE_MS);
	});

	$effect(() => {
		const flush = () => void flushSave();
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') flush();
		};
		window.addEventListener('beforeunload', flush);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			window.removeEventListener('beforeunload', flush);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	/** Put a project into the editor without triggering a save of its own contents. */
	function applyRecord(record: ProjectRecord) {
		savedSource = record.source;
		savedOptionsKey = optionsKey(record.options);
		source = record.source;
		options = { ...DEFAULT_COMPILE_OPTIONS, ...record.options };
		currentProject = toSummary(record);
		saveCurrentProjectId(record.id);
	}

	async function createFreshRecord(existing: ProjectSummary[]): Promise<ProjectRecord> {
		const record = createProjectRecord({
			name: defaultProjectName(existing),
			source: DEFAULT_SOURCE,
			options: pickShareableOptions(DEFAULT_COMPILE_OPTIONS),
		});
		await store?.put(record);
		return record;
	}

	async function bootProjects() {
		try {
			store = await openProjectStore();
			const summaries = await store.list();
			const decision = resolveInitialProject({
				hash: shared,
				summaries,
				currentId: loadCurrentProjectId(),
			});
			let record: ProjectRecord | undefined;
			if (decision.kind === 'import') {
				record = createProjectRecord({
					name: importedProjectName(decision.options.filename),
					source: decision.code,
					options: decision.options,
				});
				await store.put(record);
				history.replaceState(null, '', `${location.pathname}${location.search}`);
			} else if (decision.kind === 'open') {
				record = await store.get(decision.id);
			}
			record ??= await createFreshRecord(summaries);
			projects = sortByUpdated([...summaries.filter((p) => p.id !== record.id), toSummary(record)]);
			applyRecord(record);
		} catch (error) {
			// Persistence is best-effort: keep the in-memory editor usable.
			console.error('[projects] boot failed', error);
		} finally {
			projectsReady = true;
			void runCompile();
		}
	}

	/** Switch the editor + chat to another project; the preview re-renders like an apply. */
	async function openProject(id: string) {
		if (!store || id === currentProject?.id) return;
		await flushSave();
		const record = await store.get(id);
		if (!record) return;
		clearTimeout(previewTimer);
		previewRunId++;
		preview.cancel();
		renderAfterCompile = !autoPreview;
		applyRecord(record);
		void runCompile();
	}

	async function createProject() {
		if (!store) return;
		await flushSave();
		const record = await createFreshRecord(projects);
		projects = sortByUpdated([...projects, toSummary(record)]);
		clearTimeout(previewTimer);
		previewRunId++;
		preview.cancel();
		renderAfterCompile = !autoPreview;
		applyRecord(record);
		void runCompile();
	}

	async function renameProject(name: string) {
		if (!store || !currentProject) return;
		await flushSave();
		const record = await store.get(currentProject.id);
		if (!record) return;
		const updated = { ...record, name, updatedAt: Date.now() };
		await store.put(updated);
		currentProject = toSummary(updated);
		projects = sortByUpdated(projects.map((p) => (p.id === updated.id ? toSummary(updated) : p)));
	}

	async function deleteProject() {
		if (!store || !currentProject) return;
		const id = currentProject.id;
		clearTimeout(saveTimer);
		saveTimer = undefined;
		await store.delete(id);
		projects = projects.filter((p) => p.id !== id);
		currentProject = null;
		const next = projects[0];
		if (next) await openProject(next.id);
		else await createProject();
	}

	let runId = 0;
	let previewRunId = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let previewTimer: ReturnType<typeof setTimeout> | undefined;

	async function runPreview(
		compiled = result,
		parsed = ast,
		previewSource = source,
		previewOptions = $state.snapshot(options),
	) {
		const current = ++previewRunId;
		if (!compiled || !parsed) {
			previewStatus = 'idle';
			return;
		}

		const unsupported = validatePreview(compiled, parsed);
		if (unsupported) {
			preview.cancel();
			previewStatus = 'unsupported';
			previewError = unsupported;
			return;
		}

		previewStatus = 'rendering';
		previewError = '';
		try {
			const renderable = await compiler.compile(previewSource, {
				...previewOptions,
				internalURL: './runtime.js',
				resolvePathProvided: true,
				sourcemap: undefined,
			});
			if (current !== previewRunId) return;
			const html = await preview.render(renderable);
			previewIsolated = preview.isolated;
			if (current !== previewRunId) return;
			previewDocument = createPreviewDocument(html, renderable.css);
			previewStatus = 'ready';
			previewStale = false;
		} catch (error) {
			previewIsolated = preview.isolated;
			if (current !== previewRunId) return;
			previewStatus = 'error';
			previewError = error instanceof Error ? error.message : String(error);
		}
	}

	async function runCompile() {
		const current = ++runId;
		const start = performance.now();
		const compileSource = source;
		const compileOptions = $state.snapshot(options);
		if (result) status = 'compiling';
		try {
			const [compiled, parsed] = await Promise.all([
				compiler.compile(compileSource, compileOptions),
				compiler.parse(compileSource),
			]);
			if (current !== runId) return;
			result = compiled;
			ast = parsed;
			compileMs = Math.round(performance.now() - start);
			status = 'ready';
			errorMessage = '';
			// Manual mode still renders once on first load (nothing attempted yet).
			const firstRender = previewStatus === 'idle';
			if (previewActive && (autoPreview || renderAfterCompile || firstRender)) {
				renderAfterCompile = false;
				schedulePreview(compiled, parsed, compileSource, compileOptions);
			} else if (previewDocument) {
				previewStale = true;
			}
		} catch (error) {
			if (current !== runId) return;
			errorMessage = error instanceof Error ? error.message : String(error);
			status = 'error';
		}
	}

	function scheduleCompile() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(runCompile, COMPILE_DEBOUNCE_MS);
	}

	/** Defer the server-side render so rapid edits only cost one `/api/render` call. */
	function schedulePreview(...args: Parameters<typeof runPreview>) {
		clearTimeout(previewTimer);
		if (PREVIEW_DEBOUNCE_MS <= 0) {
			void runPreview(...args);
			return;
		}
		previewTimer = setTimeout(() => void runPreview(...args), PREVIEW_DEBOUNCE_MS);
	}

	function handleSourceChange(next: string) {
		source = next;
		if (previewActive) {
			clearTimeout(previewTimer);
			previewRunId++;
			preview.cancel();
			if (autoPreview || renderAfterCompile) {
				previewStatus = 'rendering';
			} else if (previewDocument) {
				previewStale = true;
			}
		}
		scheduleCompile();
	}

	/** Manual render (↻). Works in both modes; in Auto mode it doubles as a retry. */
	function refreshPreview() {
		clearTimeout(previewTimer);
		void runPreview();
	}

	function toggleAutoPreview() {
		autoPreview = !autoPreview;
		if (autoPreview && previewActive && previewStale) refreshPreview();
	}

	function handleOutputTabChange(tab: string) {
		previewActive = tab === 'preview';
		if (previewActive) {
			// Manual mode keeps the last render on screen; render once if there is none yet.
			if (autoPreview || !previewDocument || previewStatus !== 'ready') void runPreview();
		} else {
			clearTimeout(previewTimer);
			previewRunId++;
			preview.cancel();
		}
	}

	async function save() {
		try {
			const outcome = await saveComponent(source, options.filename ?? 'index.astro');
			saveFeedback = outcome === 'saved' ? 'saved' : outcome === 'downloaded' ? 'downloaded' : 'idle';
		} catch (error) {
			saveFeedback = 'failed';
			console.error(error);
		}
		setTimeout(() => (saveFeedback = 'idle'), 1500);
	}

	// --- AI chat panel ---
	let chatOpen = $state(loadSettings().chatOpen);

	function toggleChat() {
		chatOpen = !chatOpen;
		saveSettings({ ...loadSettings(), chatOpen });
	}

	/** Replace the editor contents with an AI proposal; recompiles + previews via the normal path. */
	function applyProposal(code: string) {
		// Applying is an explicit action, so render once even when Auto is off.
		renderAfterCompile = !autoPreview;
		handleSourceChange(code);
	}

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		applyTheme(theme);
	}

	async function share() {
		try {
			await navigator.clipboard.writeText(shareUrl(source, $state.snapshot(options)));
			shareFeedback = 'copied';
		} catch {
			shareFeedback = 'failed';
		}
		setTimeout(() => (shareFeedback = 'idle'), 1500);
	}

	// --- Resizable split between the editor and output panes ---
	const MIN_PCT = 15;
	const MAX_PCT = 85;
	let splitEl: HTMLDivElement;
	let leftPct = $state(50);
	let dragging = $state(false);

	function clampPct(value: number): number {
		return Math.min(MAX_PCT, Math.max(MIN_PCT, value));
	}

	function onGutterPointerDown(event: PointerEvent) {
		dragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onGutterPointerMove(event: PointerEvent) {
		if (!dragging || !splitEl) return;
		const rect = splitEl.getBoundingClientRect();
		leftPct = clampPct(((event.clientX - rect.left) / rect.width) * 100);
	}

	function onGutterPointerUp(event: PointerEvent) {
		dragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
	}

	function onGutterKeydown(event: KeyboardEvent) {
		const step = event.shiftKey ? 10 : 2;
		if (event.key === 'ArrowLeft') leftPct = clampPct(leftPct - step);
		else if (event.key === 'ArrowRight') leftPct = clampPct(leftPct + step);
		else if (event.key === 'Home') leftPct = MIN_PCT;
		else if (event.key === 'End') leftPct = MAX_PCT;
		else return;
		event.preventDefault();
	}

	void bootProjects();

	onDestroy(() => {
		clearTimeout(debounceTimer);
		clearTimeout(previewTimer);
		void flushSave();
		compiler.dispose();
		preview.dispose();
	});
</script>

<div class="app">
	<Toolbar
		{options}
		{theme}
		{shareFeedback}
		{saveFeedback}
		onSave={save}
		onChange={scheduleCompile}
		onToggleTheme={toggleTheme}
		onShare={share}
		{chatOpen}
		onToggleChat={toggleChat}
		{projects}
		{currentProjectId}
		projectsBusy={!projectsReady}
		onCreateProject={() => void createProject()}
		onOpenProject={(id) => void openProject(id)}
		onRenameProject={(name) => void renameProject(name)}
		onDeleteProject={() => void deleteProject()}
	/>

	{#if status === 'error'}
		<div class="error-banner" role="alert">{errorMessage}</div>
	{/if}

	<div class="workspace" class:with-chat={chatOpen}>
	<div class="split" class:dragging bind:this={splitEl} style="--left: {leftPct}%">
		<section class="pane">
			<div class="pane-head">
				<label class="visually-hidden" for="filename">{$t('editor.filename')}</label>
				<input
					class="filename"
					id="filename"
					name="filename"
					value={options.filename}
					spellcheck="false"
					oninput={(e) => {
						options.filename = e.currentTarget.value;
						scheduleCompile();
					}}
				/>
				<span class="status" data-status={status} role="status" aria-live="polite">
					{#if status === 'loading'}
						{$t('editor.starting')}
					{:else if status === 'compiling'}
						{$t('editor.compiling')}
					{:else if status === 'error'}
						{$t('editor.compilerError')}
					{:else}
						{$t('editor.compiledIn', { ms: compileMs })}
					{/if}
				</span>
			</div>
			<div class="pane-body">
				<Editor value={source} {diagnostics} {theme} onChange={handleSourceChange} />
			</div>
		</section>
		<!-- biome-ignore lint/a11y/useSemanticElements: a focusable, draggable window-splitter has no semantic HTML equivalent -->
		<div
			class="gutter"
			role="separator"
			aria-orientation="vertical"
			aria-label={$t('editor.resize')}
			aria-valuenow={Math.round(leftPct)}
			aria-valuemin={MIN_PCT}
			aria-valuemax={MAX_PCT}
			tabindex="0"
			onpointerdown={onGutterPointerDown}
			onpointermove={onGutterPointerMove}
			onpointerup={onGutterPointerUp}
			onkeydown={onGutterKeydown}
		></div>
		<section class="pane">
			<OutputTabs
				{result}
				{ast}
				{theme}
				{previewStatus}
				{previewDocument}
				{previewError}
				{autoPreview}
				{previewStale}
				rendererMode={preview.mode}
				rendererIsolated={previewIsolated}
				onTabChange={handleOutputTabChange}
				onToggleAutoPreview={toggleAutoPreview}
				onRefreshPreview={refreshPreview}
			/>
		</section>
	</div>
	{#if chatOpen && currentProjectId}
		<aside class="chat-pane">
			<ChatPanel
				projectId={currentProjectId}
				getSource={() => source}
				filename={options.filename ?? 'index.astro'}
				onApply={applyProposal}
				onClose={toggleChat}
			/>
		</aside>
	{/if}
	</div>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg);
		color: var(--fg);
	}
	.error-banner {
		padding: 0.6rem 1rem;
		background: rgba(248, 113, 113, 0.12);
		color: var(--err);
		font-size: 0.85rem;
		font-family: ui-monospace, monospace;
		border-bottom: 1px solid rgba(248, 113, 113, 0.3);
		white-space: pre-wrap;
	}
	.workspace {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}
	.workspace.with-chat {
		grid-template-columns: minmax(0, 1fr) minmax(300px, 24rem);
	}
	.chat-pane {
		min-width: 0;
		min-height: 0;
	}
	.split {
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-columns: var(--left, 50%) 6px 1fr;
	}
	.split.dragging {
		cursor: col-resize;
		user-select: none;
	}
	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	.gutter {
		cursor: col-resize;
		background: var(--border);
		border: none;
		padding: 0;
		position: relative;
	}
	/* Wider invisible hit area so the 6px gutter is easy to grab. */
	.gutter::before {
		content: '';
		position: absolute;
		inset: 0 -4px;
	}
	.gutter:hover,
	.gutter:focus-visible {
		background: var(--accent);
		outline: none;
	}
	.split.dragging .pane {
		pointer-events: none;
	}
	.pane-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		height: 40px;
		flex: none;
		padding: 0 0.75rem;
		font-size: 0.78rem;
		color: var(--muted);
		border-bottom: 1px solid var(--border);
		background: var(--panel);
	}
	.filename {
		appearance: none;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--fg);
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		padding: 0.2rem 0.4rem;
		min-width: 0;
	}
	.filename:hover {
		border-color: var(--border);
	}
	.filename:focus {
		outline: none;
		border-color: var(--accent);
	}
	.status {
		flex: none;
	}
	.status[data-status='error'] {
		color: var(--err);
	}
	.status[data-status='ready'] {
		color: var(--ok);
	}
	.pane-body {
		position: relative;
		flex: 1;
		min-height: 0;
	}
	@media (max-width: 800px) {
		.workspace.with-chat {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: 1fr minmax(16rem, 40%);
		}
		.split {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr 1fr;
		}
		.gutter {
			display: none;
		}
		.pane:first-child {
			border-bottom: 1px solid var(--border);
		}
	}
</style>
