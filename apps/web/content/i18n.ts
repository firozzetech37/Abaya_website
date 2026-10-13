/**
 * Languages of the customer website. English is served at the plain URLs (/abayas), Arabic
 * under /ar (/ar/abayas); middleware.ts maps both onto app/[lang]. Arabic pages are
 * right-to-left. Every string lives in strings.ts (English) and strings.ar.ts (Arabic).
 */
import * as ar from './strings.ar';
import * as en from './strings';

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export type Dictionary = typeof en;

/** The Arabic file must have exactly the English keys (checked here at compile time). */
const arabic: Dictionary = ar;
const dictionaries: Record<Locale, Dictionary> = { en, ar: arabic };

export const isLocale = (value: string | undefined | null): value is Locale => LOCALES.includes(value as Locale);
export const dictionaryFor = (locale: Locale): Dictionary => dictionaries[locale];
export const dirFor = (locale: Locale): 'rtl' | 'ltr' => (locale === 'ar' ? 'rtl' : 'ltr');
/** BCP 47 tag for <html lang>, dates and numbers (Western digits in both languages). */
export const htmlLang = (locale: Locale): string => (locale === 'ar' ? 'ar' : 'en-IN');
export const intlLocale = (locale: Locale): string => (locale === 'ar' ? 'ar-u-nu-latn' : 'en-IN');

/** `/abayas` → `/ar/abayas` for Arabic; external links, anchors and English paths pass through. */
export function localizePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE || !path.startsWith('/') || path.startsWith('//')) return path;
  if (path === '/ar' || path.startsWith('/ar/') || path.startsWith('/ar?')) return path;
  return path === '/' ? '/ar' : `/ar${path}`;
}

/** `/ar/abayas` (or the internal `/en/abayas`) → `/abayas`. */
export function stripLocale(pathname: string): string {
  const match = /^\/(ar|en)(?=\/|$)/.exec(pathname);
  return match ? pathname.slice(match[0].length) || '/' : pathname;
}

/** The locale of a browser path. */
export const localeOfPath = (pathname: string): Locale => (/^\/ar(\/|$)/.test(pathname) ? 'ar' : 'en');

/** Server pages under app/[lang]: the page's language and its text. */
export async function stringsFor(params: Promise<{ lang: string }>): Promise<{ locale: Locale; strings: Dictionary }> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  return { locale, strings: dictionaryFor(locale) };
}

/** Metadata alternates: this page's address in the current language, plus both languages (hreflang). */
export function alternatesFor(locale: Locale, path: string) {
  return {
    canonical: localizePath(locale, path),
    languages: { en: path, ar: localizePath('ar', path), 'x-default': path },
  };
}
