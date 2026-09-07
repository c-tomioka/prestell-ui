// UI language: a `svelte/store` so components re-render on switch, plus a
// plain `tr()` for non-Svelte code paths (error text composed at event time).
//
//   Svelte:  import { t } from "$lib/i18n";  →  {$t("chat.title")}
//   TS:      import { tr } from "$lib/i18n"; →  tr("error.timeout", { detail })
//
// `en.ts` is the source of truth; `ja.ts` must define every key (typed).
// The locale is remembered in localStorage and defaults to the browser
// language (`ja*` → Japanese, anything else → English).
import { derived, get, writable } from "svelte/store";
import { en, type MessageKey } from "./en";
import { ja } from "./ja";

export type { MessageKey };

export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_STORAGE_KEY = "prestell.locale";

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, ja };

export type Params = Record<string, string | number>;

export function isLocale(value: unknown): value is Locale {
	return (
		typeof value === "string" && (LOCALES as readonly string[]).includes(value)
	);
}

/** Fill `{name}` placeholders; unknown names are left as-is so mistakes show. */
export function format(template: string, params?: Params): string {
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match,
	);
}

/** Text for `key` in `locale` (falls back to English for safety). */
export function translate(
	locale: Locale,
	key: MessageKey,
	params?: Params,
): string {
	return format(DICTIONARIES[locale][key] ?? en[key], params);
}

/**
 * Initial locale: the stored choice wins, then the browser language.
 * Pure so it can be tested; `initLocale()` feeds it the real values.
 */
export function detectLocale(
	stored: string | null | undefined,
	navigatorLanguage: string | undefined,
): Locale {
	if (isLocale(stored)) return stored;
	return navigatorLanguage?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export const locale = writable<Locale>("en");

/** Reactive translator for Svelte templates: `{$t("key", { name })}`. */
export const t = derived(
	locale,
	($locale) =>
		(key: MessageKey, params?: Params): string =>
			translate($locale, key, params),
);

/** Non-reactive translator for plain TypeScript (uses the current locale). */
export function tr(key: MessageKey, params?: Params): string {
	return translate(get(locale), key, params);
}

function applyDocumentLang(value: Locale): void {
	if (typeof document !== "undefined") document.documentElement.lang = value;
}

/** Read the stored / browser preference once at start-up. */
export function initLocale(): Locale {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(LOCALE_STORAGE_KEY);
	} catch {
		// storage unavailable
	}
	const value = detectLocale(
		stored,
		typeof navigator === "undefined" ? undefined : navigator.language,
	);
	locale.set(value);
	applyDocumentLang(value);
	return value;
}

export function setLocale(value: Locale): void {
	locale.set(value);
	applyDocumentLang(value);
	try {
		localStorage.setItem(LOCALE_STORAGE_KEY, value);
	} catch {
		// storage unavailable; the choice lasts for this page
	}
}

export function toggleLocale(): Locale {
	const next: Locale = get(locale) === "ja" ? "en" : "ja";
	setLocale(next);
	return next;
}

// Pick the language before any component renders (browser only; tests and
// SSR keep the English default).
if (typeof window !== "undefined") initLocale();
