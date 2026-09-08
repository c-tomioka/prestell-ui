// Evaluation cases: code generation (from the built-in prompt templates) and
// Astro knowledge questions with a regex rubric for hallucination detection.
import type { ProjectContext } from "../../src/lib/ai/project-context";
import { projectContextOf } from "../../src/lib/ai/project-context";
import { PROMPT_TEMPLATES } from "../../src/lib/ai/templates";
import { createPreset } from "../../src/lib/projects/presets";
import { DEFAULT_SOURCE } from "../../src/lib/samples";

export interface CodeCase {
	id: string;
	prompt: string;
	/** Editor contents sent as "the current component". */
	source: string;
}

/** Page / Site mode: the model edits a whole project (Phase 5). */
export interface ProjectCase {
	id: string;
	prompt: string;
	/** File open in the editor. */
	filename: string;
	project: ProjectContext;
}

export interface KnowledgeCase {
	id: string;
	prompt: string;
	/** Every pattern must appear in a correct answer. */
	must: RegExp[];
	/** Any match counts as a hallucination (removed / non-existent API). */
	mustNot: RegExp[];
}

function template(id: string, ...values: string[]): string {
	const found = PROMPT_TEMPLATES.find((t) => t.id === id);
	if (!found) throw new Error(`Unknown template: ${id}`);
	let index = 0;
	return found.prompt.replace(/\[[^\]\n]+\]/g, () => values[index++] ?? "");
}

export const CODE_CASES: CodeCase[] = [
	{
		id: "card",
		prompt: template("card", "a teaser for a coffee subscription"),
		source: DEFAULT_SOURCE,
	},
	{
		id: "hero",
		prompt: template("hero", "a note-taking app"),
		source: DEFAULT_SOURCE,
	},
	{
		id: "pricing",
		prompt: template("pricing", "Starter, Pro, Enterprise"),
		source: DEFAULT_SOURCE,
	},
	{
		id: "navbar",
		prompt: template("navbar", "Northwind", "4"),
		source: DEFAULT_SOURCE,
	},
	{
		id: "contact-form",
		prompt: template("contact-form", "a light, friendly look"),
		source: DEFAULT_SOURCE,
	},
	{
		id: "landing",
		prompt: template("landing", "a habit-tracking app"),
		source: DEFAULT_SOURCE,
	},
	{
		id: "style-responsive",
		prompt: template("responsive"),
		source: DEFAULT_SOURCE,
	},
	{
		id: "style-dark-mode",
		prompt: template("dark-mode"),
		source: DEFAULT_SOURCE,
	},
];

/** Keeps the model from answering inside the "one component" frame of the system prompt. */
const GENERAL = "General Astro question, not about the current component: ";

const PAGE = createPreset("page");
const PAGE_PROJECT = projectContextOf({
	mode: "page",
	entry: PAGE.entry,
	files: PAGE.files,
});
const SITE = createPreset("site");
const SITE_PROJECT = projectContextOf({
	mode: "site",
	entry: SITE.entry,
	files: SITE.files,
});

export const PROJECT_CASES: ProjectCase[] = [
	{
		id: "site-landing",
		prompt: template("site-landing", "a note-taking app"),
		filename: PAGE.entry,
		project: PAGE_PROJECT,
	},
	{
		id: "site-add-page",
		prompt: template("site-add-page", "pricing", "plans and prices"),
		filename: SITE.entry,
		project: SITE_PROJECT,
	},
	{
		id: "site-extract",
		prompt: template("site-extract", "hero", "Hero"),
		filename: SITE.entry,
		project: SITE_PROJECT,
	},
	// A short instruction in Japanese with no path or file hints: a small model
	// once answered with public/index.html instead of an Astro page.
	{
		id: "site-ja-lp",
		prompt: "化粧水のLPを作成して",
		filename: SITE.entry,
		project: SITE_PROJECT,
	},
];

export const KNOWLEDGE_CASES: KnowledgeCase[] = [
	{
		id: "view-transitions",
		prompt: `${GENERAL}In the current Astro version, how do I enable client-side page transitions (view transitions) for the whole site? Show the exact import and component.`,
		must: [/ClientRouter/, /astro:transitions/],
		mustNot: [/<ViewTransitions/],
	},
	{
		id: "content-collections",
		prompt: `${GENERAL}How do I define a Markdown content collection for blog posts in the current Astro version and read all entries on a page? Show the config file and the query.`,
		must: [/getCollection/, /astro:content/, /\bglob\(|\bloader\b/],
		mustNot: [/Astro\.glob\(/],
	},
	{
		id: "prerender",
		prompt: `${GENERAL}My Astro site is static by default. How do I make just one page render on the server per request? Show the setting inside that page.`,
		must: [/prerender\s*=\s*false/],
		mustNot: [/output:\s*['"]hybrid['"]/],
	},
	{
		id: "env",
		prompt: `${GENERAL}How do I declare type-safe environment variables in Astro so a missing secret fails at build time? Show the config and how to import the value.`,
		must: [/astro:env/, /envField/],
		mustNot: [],
	},
	{
		id: "server-islands",
		prompt: `${GENERAL}How do I defer rendering of one component in Astro so the page is cached but that component renders on the server after the page loads? Show the directive.`,
		must: [/server:defer/],
		mustNot: [/client:defer/],
	},
	{
		id: "class-list",
		prompt: `${GENERAL}What is the Astro-specific way to apply CSS classes conditionally on an element? Show the syntax.`,
		must: [/class:list/],
		mustNot: [],
	},
	{
		id: "named-slots",
		prompt: `${GENERAL}How do I define a named slot in an Astro component and pass content into it from the parent? Show both sides.`,
		must: [/<slot\s+name=/, /slot=["']/],
		mustNot: [
			/(must|need to|have to|required to) (use|call) Astro\.slots\.render/i,
		],
	},
	{
		id: "props-typing",
		prompt: `${GENERAL}How do I type the props of an Astro component with TypeScript? Show the frontmatter.`,
		must: [/interface Props|type Props/, /Astro\.props/],
		mustNot: [/defineProps\(/],
	},
];
