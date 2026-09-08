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
	import { normalizeFilename, saveComponent } from '../lib/export';
	import { t, tr } from '../lib/i18n';
	import { DEFAULT_COMPILE_OPTIONS } from '../lib/options';
	import {
		createPreviewDocument,
		preview,
		validatePreview,
	} from '../lib/preview';
	import {
		buildPreviewGraph,
		createCachedCompiler,
		extensionOf,
		importChecker,
		PreviewUnsupportedError,
	} from '../lib/preview-graph';
	import { loadAutoPreview, saveAutoPreview } from '../lib/preview-settings';
	import { resolveInitialProject } from '../lib/projects/boot';
	import { loadCurrentProjectId, saveCurrentProjectId } from '../lib/projects/current';
	import {
		addFile,
		basename,
		deleteFile,
		entryCandidates,
		languageFor,
		renameFile,
		templateForNewFile,
		validateFilePath,
	} from '../lib/projects/files';
	import { defaultProjectName, importedProjectName } from '../lib/projects/naming';
	import { createPreset, promoteToPage } from '../lib/projects/presets';
	import {
		createProjectRecord,
		pickProjectOptions,
		sortByUpdated,
		toSummary,
	} from '../lib/projects/record';
	import { openProjectStore } from '../lib/projects/store';
	import type {
		ProjectFile,
		ProjectMode,
		ProjectOptions,
		ProjectRecord,
		ProjectStore,
		ProjectSummary,
	} from '../lib/projects/types';
	import { readSharedState, shareUrl } from '../lib/share';
	import { applyTheme, initialTheme, type Theme } from '../lib/theme';
	import ChatPanel from './chat/ChatPanel.svelte';
	import Editor from './Editor.svelte';
	import FileTree from './FileTree.svelte';
	import OutputTabs from './OutputTabs.svelte';
	import Toolbar, { type SaveFeedback, type ShareFeedback } from './Toolbar.svelte';

	// --- project contents (the file map is the model; see lib/projects/types.ts) ---
	const shared = readSharedState();
	const initial = createPreset('component');
	let files = $state<Record<string, ProjectFile>>(
		shared?.code !== undefined
			? { [normalizeFilename(shared.options.filename ?? '')]: shared.code }
			: initial.files,
	);
	let entry = $state(shared?.code !== undefined ? normalizeFilename(shared.options.filename ?? '') : initial.entry);
	let mode = $state<ProjectMode>('component');
	/** File shown in the editor. */
	let activePath = $state(entry);
	/** Editor tabs (Page / Site modes). */
	let openPaths = $state<string[]>([entry]);
	let options = $state({ ...DEFAULT_COMPILE_OPTIONS, ...pickProjectOptions(shared?.options ?? {}) });
	/** Bumped on every change to files / entry / mode so the save effect can watch one primitive. */
	let revision = $state(0);
	let treeCollapsed = $state(false);

	const source = $derived(typeof files[activePath] === 'string' ? (files[activePath] as string) : '');
	const activeIsAstro = $derived(extensionOf(activePath) === '.astro');
	const activeIsBinary = $derived(files[activePath] instanceof Blob);
	const entries = $derived(entryCandidates(files));
	const editorLanguage = $derived(languageFor(activePath));
	const showTree = $derived(mode !== 'component');
	const importCheck = $derived(mode === 'component' ? undefined : importChecker(files, activePath));

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
	let savedRevision = 0;
	let savedOptionsKey = '';

	function optionsKey(project: Partial<ProjectOptions>): string {
		return JSON.stringify(project);
	}

	function snapshotRecord(project: ProjectSummary, now: number): ProjectRecord {
		return {
			id: project.id,
			name: project.name,
			createdAt: project.createdAt,
			updatedAt: now,
			schemaVersion: 2,
			mode,
			entry,
			files: { ...$state.snapshot(files) } as Record<string, ProjectFile>,
			options: pickProjectOptions($state.snapshot(options)),
		};
	}

	async function saveProject(nextRevision: number, nextOptionsKey: string) {
		if (!store || !currentProject) return;
		const project = currentProject;
		const now = Date.now();
		const record = snapshotRecord(project, now);
		try {
			await store.put(record);
		} catch (error) {
			console.error('[projects] save failed', error);
			return;
		}
		savedRevision = nextRevision;
		savedOptionsKey = nextOptionsKey;
		if (currentProject?.id === project.id) {
			currentProject = { ...project, mode, updatedAt: now };
			projects = sortByUpdated(
				projects.map((p) => (p.id === project.id ? { ...p, mode, updatedAt: now } : p)),
			);
		}
	}

	/** Write any pending edit immediately (before switching projects or leaving the page). */
	function flushSave(): Promise<void> {
		if (saveTimer === undefined) return Promise.resolve();
		clearTimeout(saveTimer);
		saveTimer = undefined;
		return saveProject(revision, optionsKey(pickProjectOptions($state.snapshot(options))));
	}

	$effect(() => {
		const nextRevision = revision;
		const nextOptionsKey = optionsKey(pickProjectOptions($state.snapshot(options)));
		if (!projectsReady || !currentProject) return;
		if (nextRevision === savedRevision && nextOptionsKey === savedOptionsKey) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = undefined;
			void saveProject(nextRevision, nextOptionsKey);
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
		files = { ...record.files };
		entry = record.entry;
		mode = record.mode;
		activePath = record.entry;
		openPaths = [record.entry];
		options = { ...DEFAULT_COMPILE_OPTIONS, ...record.options };
		revision++;
		savedRevision = revision;
		savedOptionsKey = optionsKey(record.options);
		previewCompiler.clear();
		currentProject = toSummary(record);
		saveCurrentProjectId(record.id);
	}

	async function createFreshRecord(existing: ProjectSummary[], presetMode: ProjectMode): Promise<ProjectRecord> {
		const preset = createPreset(presetMode);
		const record = createProjectRecord({
			name: defaultProjectName(existing),
			mode: presetMode,
			entry: preset.entry,
			files: preset.files,
			options: pickProjectOptions(DEFAULT_COMPILE_OPTIONS),
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
				const filename = normalizeFilename(decision.options.filename ?? '');
				record = createProjectRecord({
					name: importedProjectName(filename),
					mode: 'component',
					entry: filename,
					files: { [filename]: decision.code },
					options: pickProjectOptions(decision.options),
				});
				await store.put(record);
				history.replaceState(null, '', `${location.pathname}${location.search}`);
			} else if (decision.kind === 'open') {
				record = await store.get(decision.id);
			}
			record ??= await createFreshRecord(summaries, 'component');
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

	function resetPreviewForSwitch() {
		clearTimeout(previewTimer);
		previewRunId++;
		preview.cancel();
		renderAfterCompile = !autoPreview;
	}

	/** Switch the editor + chat to another project; the preview re-renders like an apply. */
	async function openProject(id: string) {
		if (!store || id === currentProject?.id) return;
		await flushSave();
		const record = await store.get(id);
		if (!record) return;
		resetPreviewForSwitch();
		applyRecord(record);
		void runCompile();
	}

	async function createProject(presetMode: ProjectMode) {
		if (!store) return;
		await flushSave();
		const record = await createFreshRecord(projects, presetMode);
		projects = sortByUpdated([...projects, toSummary(record)]);
		resetPreviewForSwitch();
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
		else await createProject('component');
	}

	/** Component → Page: keeps the project id and chat, changes its files and mode. */
	async function promoteProject() {
		if (!currentProject || mode !== 'component') return;
		if (!window.confirm(tr('project.promoteConfirm', { file: entry }))) return;
		await flushSave();
		const promoted = promoteToPage(snapshotRecord(currentProject, Date.now()));
		resetPreviewForSwitch();
		applyRecord(promoted);
		// applyRecord marks the contents as saved; this one must be written.
		savedRevision = -1;
		void runCompile();
	}

	// --- files ---
	function touchFiles(next: Record<string, ProjectFile>) {
		files = next;
		revision++;
	}

	function openFile(path: string) {
		if (!(path in files) || path === activePath) return;
		if (!openPaths.includes(path)) openPaths = [...openPaths, path];
		activePath = path;
		void runCompile();
	}

	function closeTab(path: string) {
		const index = openPaths.indexOf(path);
		if (index === -1 || openPaths.length === 1) return;
		openPaths = openPaths.filter((p) => p !== path);
		if (activePath === path) {
			activePath = openPaths[Math.max(0, index - 1)];
			void runCompile();
		}
	}

	function promptPath(message: string, initial: string): string | null {
		const answer = window.prompt(message, initial);
		return answer === null ? null : answer;
	}

	function addNewFile() {
		const input = promptPath(tr('files.addPrompt'), 'src/components/');
		if (input === null) return;
		const checked = validateFilePath(input, mode);
		if ('error' in checked) {
			window.alert(tr(checked.error));
			return;
		}
		if (checked.path in files) {
			window.alert(tr('files.exists', { path: checked.path }));
			return;
		}
		touchFiles(addFile(files, checked.path, templateForNewFile(checked.path)));
		openFile(checked.path);
		onProjectContentChanged();
	}

	function renameExistingFile(from: string) {
		const input = promptPath(tr('files.renamePrompt', { path: from }), from);
		if (input === null) return;
		const checked = validateFilePath(input, mode);
		if ('error' in checked) {
			window.alert(tr(checked.error));
			return;
		}
		const to = checked.path;
		if (to === from) return;
		if (to in files) {
			window.alert(tr('files.exists', { path: to }));
			return;
		}
		touchFiles(renameFile(files, from, to));
		if (entry === from) entry = to;
		openPaths = openPaths.map((p) => (p === from ? to : p));
		if (activePath === from) activePath = to;
		onProjectContentChanged();
	}

	function deleteExistingFile(path: string) {
		if (path === entry) {
			window.alert(tr('files.cannotDeleteEntry', { path }));
			return;
		}
		if (!window.confirm(tr('files.deleteConfirm', { path }))) return;
		touchFiles(deleteFile(files, path));
		const index = openPaths.indexOf(path);
		if (index !== -1) {
			openPaths = openPaths.filter((p) => p !== path);
			if (openPaths.length === 0) openPaths = [entry];
		}
		if (activePath === path) activePath = openPaths[Math.max(0, index - 1)] ?? openPaths[0];
		onProjectContentChanged();
	}

	function changeEntry(path: string) {
		if (!(path in files) || path === entry) return;
		entry = path;
		revision++;
		onProjectContentChanged();
	}

	/** In Component mode the pane-head input renames the single file. */
	function renameComponentFile(input: string) {
		const checked = validateFilePath(input, 'component');
		if ('error' in checked || checked.path === entry) return;
		touchFiles(renameFile(files, entry, checked.path));
		entry = checked.path;
		activePath = checked.path;
		openPaths = [checked.path];
		scheduleCompile();
	}

	/** Structure changed (not just the active file's text): recompile and re-render. */
	function onProjectContentChanged() {
		if (previewActive) {
			clearTimeout(previewTimer);
			previewRunId++;
			preview.cancel();
			if (autoPreview || renderAfterCompile) previewStatus = 'rendering';
			else if (previewDocument) previewStale = true;
		}
		scheduleCompile();
	}

	let runId = 0;
	let previewRunId = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let previewTimer: ReturnType<typeof setTimeout> | undefined;

	/** Compiles files for the preview; a file is recompiled only when its text changed. */
	const previewCompiler = createCachedCompiler(async (path, text) => {
		const previewOptions = $state.snapshot(options);
		const [compiled, parsed] = await Promise.all([
			compiler.compile(text, {
				...previewOptions,
				filename: path,
				internalURL: './runtime.js',
				resolvePathProvided: true,
				sourcemap: undefined,
			}),
			compiler.parse(text),
		]);
		return { result: compiled, ast: parsed };
	});
	let previewOptionsKey = '';

	async function runPreview(compiled = result, parsed = ast) {
		const current = ++previewRunId;
		const previewFiles = $state.snapshot(files) as Record<string, ProjectFile>;
		const previewEntry = entry;
		const previewMode = mode;
		if (!(previewEntry in previewFiles)) {
			previewStatus = 'idle';
			return;
		}

		// Cheap early exit when the active file is the entry and already compiled.
		if (compiled && parsed && activePath === previewEntry) {
			const unsupported = validatePreview(
				compiled,
				parsed,
				previewMode === 'component' ? undefined : importChecker(previewFiles, previewEntry),
			);
			if (unsupported) {
				preview.cancel();
				previewStatus = 'unsupported';
				previewError = unsupported;
				return;
			}
		}

		previewStatus = 'rendering';
		previewError = '';
		try {
			const key = optionsKey(pickProjectOptions($state.snapshot(options)));
			if (key !== previewOptionsKey) {
				previewOptionsKey = key;
				previewCompiler.clear();
			}
			const graph = await buildPreviewGraph({
				entry: previewEntry,
				files: previewFiles,
				allowImports: previewMode !== 'component',
				validate: validatePreview,
				compile: previewCompiler.compile,
			});
			previewCompiler.prune(Object.keys(previewFiles));
			if (current !== previewRunId) return;
			const html = await preview.render(graph);
			previewIsolated = preview.isolated;
			if (current !== previewRunId) return;
			previewDocument = createPreviewDocument(html, graph.css);
			previewStatus = 'ready';
			previewStale = false;
		} catch (error) {
			previewIsolated = preview.isolated;
			if (current !== previewRunId) return;
			previewStatus = error instanceof PreviewUnsupportedError ? 'unsupported' : 'error';
			previewError = error instanceof Error ? error.message : String(error);
		}
	}

	async function runCompile() {
		const current = ++runId;
		const start = performance.now();
		const compileSource = source;
		const compilePath = activePath;
		const compileOptions = { ...$state.snapshot(options), filename: compilePath };
		if (!activeIsAstro) {
			// Nothing to compile for CSS / SVG / text; the preview still follows the entry.
			result = null;
			ast = null;
			status = 'ready';
			errorMessage = '';
			compileMs = 0;
			if (previewActive && (autoPreview || renderAfterCompile || previewStatus === 'idle')) {
				renderAfterCompile = false;
				schedulePreview(null, null);
			} else if (previewDocument) {
				previewStale = true;
			}
			return;
		}
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
				schedulePreview(compiled, parsed);
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
		if (activeIsBinary) return;
		if (files[activePath] === next) return;
		touchFiles({ ...files, [activePath]: next });
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
			const outcome = await saveComponent(source, basename(activePath) || 'index.astro');
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

	/** Replace the active file with an AI proposal; recompiles + previews via the normal path. */
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
		if (mode !== 'component') return;
		try {
			await navigator.clipboard.writeText(
				shareUrl(source, { ...pickProjectOptions($state.snapshot(options)), filename: entry }),
			);
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
		shareAvailable={mode === 'component'}
		{chatOpen}
		onToggleChat={toggleChat}
		{projects}
		{currentProjectId}
		projectsBusy={!projectsReady}
		onCreateProject={(presetMode) => void createProject(presetMode)}
		onOpenProject={(id) => void openProject(id)}
		onRenameProject={(name) => void renameProject(name)}
		onDeleteProject={() => void deleteProject()}
		onPromoteProject={() => void promoteProject()}
	/>

	{#if status === 'error'}
		<div class="error-banner" role="alert">{errorMessage}</div>
	{/if}

	<div class="workspace" class:with-chat={chatOpen}>
	<div class="split" class:dragging class:with-tree={showTree} class:tree-collapsed={treeCollapsed} bind:this={splitEl} style="--left: {leftPct}%">
		{#if showTree}
			<FileTree
				{files}
				{activePath}
				{entry}
				collapsed={treeCollapsed}
				onOpen={openFile}
				onAdd={addNewFile}
				onRename={renameExistingFile}
				onDelete={deleteExistingFile}
				onToggle={() => (treeCollapsed = !treeCollapsed)}
			/>
		{/if}
		<section class="pane">
			<div class="pane-head">
				{#if mode === 'component'}
					<label class="visually-hidden" for="filename">{$t('editor.filename')}</label>
					<input
						class="filename"
						id="filename"
						name="filename"
						value={entry}
						spellcheck="false"
						onchange={(e) => renameComponentFile(e.currentTarget.value)}
					/>
				{:else}
					<div class="tabs" role="tablist" aria-label={$t('editor.tabs')}>
						{#each openPaths as path (path)}
							<span class="tab" class:active={path === activePath} role="presentation">
								<button
									type="button"
									role="tab"
									aria-selected={path === activePath}
									title={path}
									onclick={() => openFile(path)}
								>
									{basename(path)}
								</button>
								{#if openPaths.length > 1}
									<button
										type="button"
										class="close"
										aria-label={$t('editor.closeTab', { path })}
										onclick={() => closeTab(path)}
									>
										×
									</button>
								{/if}
							</span>
						{/each}
					</div>
				{/if}
				<span class="status" data-status={status} role="status" aria-live="polite">
					{#if status === 'loading'}
						{$t('editor.starting')}
					{:else if status === 'compiling'}
						{$t('editor.compiling')}
					{:else if status === 'error'}
						{$t('editor.compilerError')}
					{:else if !activeIsAstro}
						{basename(activePath)}
					{:else}
						{$t('editor.compiledIn', { ms: compileMs })}
					{/if}
				</span>
			</div>
			<div class="pane-body">
				{#if activeIsBinary}
					<div class="binary" role="status"><p>{$t('files.binary')}</p></div>
				{:else}
					<Editor value={source} {diagnostics} {theme} language={editorLanguage} onChange={handleSourceChange} />
				{/if}
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
				entries={mode === 'component' ? [] : entries}
				{entry}
				{activeIsAstro}
				onEntryChange={changeEntry}
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
				filename={activePath}
				checkImport={importCheck}
				multiFile={mode !== 'component'}
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
	/* The file tree takes a fixed column; the editor / output split shares the rest. */
	.split.with-tree {
		grid-template-columns: 220px minmax(0, var(--left, 50%)) 6px minmax(0, 1fr);
	}
	.split.with-tree.tree-collapsed {
		grid-template-columns: 36px minmax(0, var(--left, 50%)) 6px minmax(0, 1fr);
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
	.tabs {
		display: flex;
		align-items: stretch;
		gap: 0.15rem;
		min-width: 0;
		height: 100%;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		flex: none;
		border-bottom: 2px solid transparent;
		font-family: ui-monospace, monospace;
	}
	.tab.active {
		border-bottom-color: var(--accent);
		color: var(--fg);
	}
	.tab button {
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		padding: 0 0.4rem;
		height: 100%;
		cursor: pointer;
	}
	.tab button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.tab .close {
		padding: 0 0.3rem;
		font-size: 0.9rem;
		line-height: 1;
		opacity: 0.6;
	}
	.tab .close:hover {
		opacity: 1;
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
	.binary {
		display: grid;
		place-items: center;
		height: 100%;
		color: var(--muted);
	}
	@media (max-width: 800px) {
		.workspace.with-chat {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: 1fr minmax(16rem, 40%);
		}
		.split,
		.split.with-tree,
		.split.with-tree.tree-collapsed {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr 1fr;
		}
		.split:not(.with-tree) {
			grid-template-rows: 1fr 1fr;
		}
		.gutter {
			display: none;
		}
		.pane:first-of-type {
			border-bottom: 1px solid var(--border);
		}
	}
</style>
