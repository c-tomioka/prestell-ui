// Built-in prompt templates for the chat composer. Pure data + helpers; the
// panel inserts the text and the user edits `[...]` placeholders before
// sending. Wording follows the system prompt's output contract (one complete,
// self-contained component; props with defaults; "the current component").

export type TemplateCategory = "component" | "layout" | "style" | "project";

export interface PromptTemplate {
	id: string;
	category: TemplateCategory;
	label: string;
	/** Text inserted into the composer. `[...]` marks a placeholder to fill in. */
	prompt: string;
}

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
	component: "Component",
	layout: "Layout",
	style: "Style",
	project: "Page / Site",
};

const STYLE_TAIL =
	"Keep the markup and content as they are and return the complete component.";

function style(id: string, label: string, ask: string): PromptTemplate {
	return {
		id,
		category: "style",
		label,
		prompt: `Restyle the current component: ${ask} ${STYLE_TAIL}`,
	};
}

export const PROMPT_TEMPLATES: readonly PromptTemplate[] = [
	// --- component ---
	{
		id: "card",
		category: "component",
		label: "Card",
		prompt:
			"Create a card component with an image placeholder (inline SVG), a title, a short description, and a primary button. Expose props `title`, `description`, and `ctaLabel` with sensible defaults. Purpose: [what the card is for].",
	},
	{
		id: "hero",
		category: "component",
		label: "Hero section",
		prompt:
			"Create a hero section for [product or page] with a headline, a subheadline, a primary and a secondary call-to-action button, and a subtle decorative background made with CSS only. Expose `headline` and `subheadline` props with defaults.",
	},
	{
		id: "pricing",
		category: "component",
		label: "Pricing section",
		prompt:
			"Create a pricing section with three tiers ([Starter, Pro, Enterprise]) where the middle tier is visually highlighted as recommended. Each tier shows a name, a monthly price, a short feature list, and a button. Define the tiers as a plain array in the frontmatter.",
	},
	{
		id: "navbar",
		category: "component",
		label: "Navigation bar",
		prompt:
			"Create a responsive navigation bar with a text logo ([Brand]) on the left and [4] links on the right. On narrow screens collapse the links behind a hamburger button toggled by an inline <script> (no frameworks). Mark the current page link with `aria-current`.",
	},
	{
		id: "contact-form",
		category: "component",
		label: "Contact form",
		prompt:
			"Create an accessible contact form with name, email, and message fields plus a submit button. Use proper <label>s, `required` and `type` attributes, and show a short hint text under each field. Style it for [light, friendly look]. Do not add any network calls.",
	},
	{
		id: "testimonials",
		category: "component",
		label: "Testimonials",
		prompt:
			"Create a testimonials section with three quotes about [product]. Each item shows the quote, the author's name, and their role, with an initials avatar drawn with CSS. Define the items as an array in the frontmatter and render them with `.map`.",
	},
	{
		id: "feature-grid",
		category: "component",
		label: "Feature grid",
		prompt:
			"Create a feature grid with [6] items for [product]. Each item has a small inline SVG icon, a title, and one sentence. Use CSS grid with three columns that collapse to one on narrow screens.",
	},
	// --- layout ---
	{
		id: "landing",
		category: "layout",
		label: "Landing page",
		prompt:
			"Create a complete landing page for [product] as a single component: a header with navigation, a hero, a three-item feature section, a call-to-action band, and a footer. Keep all content and styles in this one file and use semantic landmarks (header, main, section, footer).",
	},
	{
		id: "two-column",
		category: "layout",
		label: "Two-column layout",
		prompt:
			"Create a two-column layout with a [240px] sidebar containing a vertical link list and a main area with a page title and placeholder content for [purpose]. Stack the columns vertically below 720px. Use CSS grid.",
	},
	{
		id: "dashboard",
		category: "layout",
		label: "Dashboard grid",
		prompt:
			"Create a dashboard layout for [what it monitors]: a top bar with a title, a row of four stat cards (label, value, trend), and a responsive grid of panels with placeholder content. Define the stats as an array in the frontmatter.",
	},
	{
		id: "blog-post",
		category: "layout",
		label: "Blog post",
		prompt:
			"Create a blog post layout about [topic]: an article with a title, author and date line, a short table of contents linking to three section headings, readable prose width, and a styled blockquote and code block. Expose `title` and `author` props with defaults.",
	},
	// --- style (applies to the current component) ---
	style(
		"responsive",
		"Make it responsive",
		"make it work well from 360px to 1440px wide using fluid sizes, flexible grids, and at most two media queries.",
	),
	style(
		"a11y",
		"Improve accessibility",
		"add missing landmarks, labels, alt text, and visible focus styles; ensure color contrast of at least 4.5:1 and a logical heading order.",
	),
	style(
		"dark-mode",
		"Add dark mode",
		"define the colors as CSS custom properties and add a `prefers-color-scheme: dark` variant with comfortable contrast.",
	),
	style(
		"typography",
		"Polish spacing & typography",
		"use a consistent spacing scale, a clear type scale, and comfortable line heights; align elements to a simple rhythm.",
	),
	style(
		"states",
		"Add hover / focus states",
		"add hover, focus-visible, and active states for every interactive element with smooth transitions.",
	),
	style(
		"simplify-css",
		"Simplify the CSS",
		"remove redundant rules, merge duplicated declarations, and prefer modern layout (flexbox/grid) over hacks, keeping the same visual result.",
	),
	style(
		"css-vars",
		"Use CSS custom properties",
		"move every color, radius, and spacing value into CSS custom properties declared on the component root.",
	),
	// --- project (Page / Site mode: several files per reply) ---
	{
		id: "site-landing",
		category: "project",
		label: "Landing page (multi-file)",
		prompt:
			"Turn src/pages/index.astro into a landing page for [product]: a hero, a three-item feature section, a testimonials section, and a call-to-action band. Put each section in its own component under src/components/ with props that have defaults, compose them from the page inside the existing layout, and keep shared colors and spacing in src/styles/global.css.",
	},
	{
		id: "site-add-page",
		category: "project",
		label: "Add a page",
		prompt:
			"Add a new page src/pages/[pricing].astro about [what it covers] using the existing layout and components, and link to it from the navigation. Give it a heading, an intro paragraph, and one main section with real placeholder content.",
	},
	{
		id: "site-extract",
		category: "project",
		label: "Extract a component",
		prompt:
			"Extract the [hero] section of the open page into src/components/[Hero].astro. Expose the text it needs as props with defaults, move its styles with it, and use the new component from the page so the result looks the same.",
	},
	{
		id: "site-section",
		category: "project",
		label: "Add a section",
		prompt:
			"Add a [pricing] section to the open page as a new component src/components/[Pricing].astro: [three tiers with a highlighted middle plan]. Define the data as an array in the component's frontmatter and match the site's existing styles.",
	},
	{
		id: "site-theme",
		category: "project",
		label: "Restyle the whole site",
		prompt:
			"Restyle the site for [brand or mood]: update the color palette, typography, and spacing scale as CSS custom properties in src/styles/global.css and adjust the layout, header, and footer so every page picks up the new look. Keep the content as it is.",
	},
];

/** Grouped templates; `project` templates only make sense in Page / Site mode. */
export function templatesByCategory(
	options: { multiFile?: boolean } = {},
): Array<{
	category: TemplateCategory;
	label: string;
	templates: PromptTemplate[];
}> {
	return (Object.keys(TEMPLATE_CATEGORY_LABELS) as TemplateCategory[])
		.filter((category) => options.multiFile || category !== "project")
		.map((category) => ({
			category,
			label: TEMPLATE_CATEGORY_LABELS[category],
			templates: PROMPT_TEMPLATES.filter((t) => t.category === category),
		}));
}

const PLACEHOLDER = /\[[^\]\n]+\]/;

/** Range of the first `[...]` placeholder, to select it for the user. */
export function firstPlaceholder(
	text: string,
): { start: number; end: number } | null {
	const match = PLACEHOLDER.exec(text);
	if (!match) return null;
	return { start: match.index, end: match.index + match[0].length };
}

/** Replace an empty composer, or append after a blank line. */
export function insertTemplate(
	current: string,
	template: PromptTemplate,
): { text: string; selection: { start: number; end: number } | null } {
	const base = current.trimEnd();
	const prefix = base === "" ? "" : `${base}\n\n`;
	const text = prefix + template.prompt;
	const local = firstPlaceholder(template.prompt);
	return {
		text,
		selection: local
			? { start: prefix.length + local.start, end: prefix.length + local.end }
			: null,
	};
}
