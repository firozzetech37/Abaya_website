import type { Currency } from '@abaya/contracts';

/**
 * Geo defaults (docs/apps/web.md "Languages"): a first visit from the Gulf opens the Arabic site
 * with the local currency; India and everywhere else open in English with rupees. The visitor's
 * own choice (language switch, currency switch) always wins afterwards.
 */

/** The visitor's country (ISO 3166 alpha-2), set by the middleware from the host's geo header. */
export const COUNTRY_COOKIE = 'abaya.country';
/** Set once the first-visit language choice was made, so the visitor is never redirected again. */
export const LANG_AUTO_COOKIE = 'abaya.lang-auto';
/** Set by a `?country=XX` test visit: the browser forgets its saved currency once. */
export const GEO_RESET_COOKIE = 'abaya.geo-reset';

/** Saudi Arabia, the UAE, Qatar, Kuwait, Bahrain and Oman. */
export const ARABIC_COUNTRIES: readonly string[] = ['SA', 'AE', 'QA', 'KW', 'BH', 'OM'];

/** The display currency a country starts with; null: no geo default (the page language decides). */
export function currencyForCountry(country: string | null | undefined): Currency | null {
  if (!country) return null;
  const c = country.toUpperCase();
  if (c === 'SA') return 'SAR';
  if (ARABIC_COUNTRIES.includes(c)) return 'AED';
  return 'INR';
}

export const isCountryCode = (v: string | null | undefined): v is string => !!v && /^[A-Za-z]{2}$/.test(v);
