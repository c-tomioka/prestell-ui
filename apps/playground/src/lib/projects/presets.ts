// Initial files for each project mode, and the Component → Page promotion.
// All three modes share the file model (`types.ts`); these are only presets.
import { DEFAULT_SOURCE } from "../samples";
import { basename } from "./files";
import type { ProjectFile, ProjectMode, ProjectRecord } from "./types";

/** Name of the single file in a new Component project. */
export const DEFAULT_COMPONENT_FILENAME = "Component.astro";
export const PAGE_ENTRY = "src/pages/index.astro";

export interface ProjectPreset {
	entry: string;
	files: Record<string, ProjectFile>;
}

const LAYOUT = `---
interface Props {
	title?: string;
	description?: string;
}

const { title = 'My site', description = 'Built with Prestell UI' } = Astro.props;
---

<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="description" content={description} />
		<title>{title}</title>
	</head>
	<body>
		<slot />
	</body>
</html>

<style is:global>
	:root {
		--bg: #ffffff;
		--fg: #0f172a;
		--muted: #475569;
		--accent: #5b21b6;
		--border: #d8dee9;
	}
	* {
		box-sizing: border-box;
	}
	body {
		margin: 0;
		background: var(--bg);
		color: var(--fg);
		font-family: system-ui, sans-serif;
		line-height: 1.6;
	}
</style>
`;

const GLOBAL_CSS = `/* Shared styles imported by pages and components. */
.container {
	max-width: 60rem;
	margin: 0 auto;
	padding: 0 1.5rem;
}
.button {
	display: inline-block;
	padding: 0.65rem 1.1rem;
	border-radius: 0.5rem;
	background: var(--accent);
	color: white;
	text-decoration: none;
	font-weight: 600;
}
`;

const PAGE_INDEX = `---
import Layout from '../layouts/Layout.astro';
import '../styles/global.css';

const features = ['Pages and layouts', 'Shared components', 'Plain CSS'];
---

<Layout title="Welcome">
	<main class="container hero">
		<p class="eyebrow">ASTRO PAGE</p>
		<h1>Welcome to your new page</h1>
		<p class="lede">
			Edit this page, the layout in <code>src/layouts/</code>, or ask the AI chat for
			changes. The Preview renders the page through the layout.
		</p>
		<ul>
			{features.map((feature) => <li>{feature}</li>)}
		</ul>
		<a class="button" href="#">Get started</a>
	</main>
</Layout>

<style>
	.hero {
		padding: 4rem 1.5rem;
	}
	h1 {
		margin: 0 0 0.5rem;
		font-size: 2.5rem;
		color: var(--accent);
	}
	.eyebrow {
		margin: 0 0 0.75rem;
		color: #7c3aed;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.12em;
	}
	.lede {
		color: var(--muted);
		max-width: 40rem;
	}
</style>
`;

const HEADER = `---
interface Props {
	current?: string;
}

const { current = '/' } = Astro.props;
const links = [
	{ href: '/', label: 'Home' },
	{ href: '/about', label: 'About' },
];
---

<header class="header">
	<nav class="container">
		<a class="brand" href="/">My site</a>
		<ul>
			{links.map((link) => (
				<li><a href={link.href} aria-current={link.href === current ? 'page' : undefined}>{link.label}</a></li>
			))}
		</ul>
	</nav>
</header>

<style>
	.header {
		border-bottom: 1px solid var(--border);
	}
	nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 3.5rem;
	}
	.brand {
		font-weight: 700;
		color: var(--fg);
		text-decoration: none;
	}
	ul {
		display: flex;
		gap: 1.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	a {
		color: var(--muted);
		text-decoration: none;
	}
	a[aria-current='page'] {
		color: var(--accent);
		font-weight: 600;
	}
</style>
`;

const FOOTER = `---
const year = new Date().getFullYear();
---

<footer class="footer">
	<div class="container">© {year} My site · Built with Astro</div>
</footer>

<style>
	.footer {
		margin-top: 4rem;
		padding: 1.5rem 0;
		border-top: 1px solid var(--border);
		color: var(--muted);
		font-size: 0.85rem;
	}
</style>
`;

const SITE_INDEX = `---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import '../styles/global.css';

const features = [
	{ title: 'Pages', text: 'Each file in src/pages/ is a page. Switch pages from the Preview select.' },
	{ title: 'Components', text: 'Shared pieces live in src/components/ and are imported where needed.' },
	{ title: 'Styles', text: 'Scoped <style> blocks per file, plus global CSS in src/styles/.' },
];
---

<Layout title="Home">
	<Header current="/" />
	<main class="container">
		<section class="hero">
			<h1>Build a site, not just a component</h1>
			<p class="lede">This is the Site preset: a layout, two pages, a header and a footer.</p>
			<a class="button" href="/about">Learn more</a>
		</section>
		<section class="features">
			{features.map((feature) => (
				<article>
					<h2>{feature.title}</h2>
					<p>{feature.text}</p>
				</article>
			))}
		</section>
	</main>
	<Footer />
</Layout>

<style>
	.hero {
		padding: 4rem 0 2rem;
	}
	h1 {
		margin: 0 0 0.5rem;
		font-size: 2.5rem;
		color: var(--accent);
	}
	.lede {
		color: var(--muted);
		max-width: 40rem;
	}
	.features {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		margin-top: 2rem;
	}
	article {
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
	}
	h2 {
		margin: 0 0 0.25rem;
		font-size: 1.1rem;
	}
</style>
`;

const SITE_ABOUT = `---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import '../styles/global.css';
---

<Layout title="About">
	<Header current="/about" />
	<main class="container">
		<h1>About</h1>
		<p>Add more pages by creating files in <code>src/pages/</code>.</p>
	</main>
	<Footer />
</Layout>

<style>
	h1 {
		margin-top: 3rem;
		color: var(--accent);
	}
</style>
`;

export function createPreset(mode: ProjectMode): ProjectPreset {
	switch (mode) {
		case "component":
			return {
				entry: DEFAULT_COMPONENT_FILENAME,
				files: { [DEFAULT_COMPONENT_FILENAME]: DEFAULT_SOURCE },
			};
		case "page":
			return {
				entry: PAGE_ENTRY,
				files: {
					[PAGE_ENTRY]: PAGE_INDEX,
					"src/layouts/Layout.astro": LAYOUT,
					"src/styles/global.css": GLOBAL_CSS,
				},
			};
		case "site":
			return {
				entry: PAGE_ENTRY,
				files: {
					[PAGE_ENTRY]: SITE_INDEX,
					"src/pages/about.astro": SITE_ABOUT,
					"src/layouts/Layout.astro": LAYOUT,
					"src/components/Header.astro": HEADER,
					"src/components/Footer.astro": FOOTER,
					"src/styles/global.css": GLOBAL_CSS,
				},
			};
	}
}

/** `my-card.astro` → `MyCard`; anything unusable → `Component`. */
export function componentNameFor(filename: string): string {
	const stem = basename(filename).replace(/\.astro$/i, "");
	const name = stem
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join("");
	return /^[A-Za-z]/.test(name) ? name : "Component";
}

/**
 * Component → Page: the component moves to `src/components/`, and a new
 * index page renders it inside a layout. The mode becomes `page`.
 */
export function promoteToPage(record: ProjectRecord): ProjectRecord {
	const name = componentNameFor(record.entry);
	const componentPath = `src/components/${name}.astro`;
	const page = `---
import Layout from '../layouts/Layout.astro';
import ${name} from '../components/${name}.astro';
---

<Layout title="${name}">
	<${name} />
</Layout>
`;
	return {
		...record,
		mode: "page",
		entry: PAGE_ENTRY,
		files: {
			[PAGE_ENTRY]: page,
			"src/layouts/Layout.astro": LAYOUT,
			[componentPath]: record.files[record.entry] ?? "",
		},
	};
}
