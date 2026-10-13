'use client';

import { CURRENCIES, type Currency, type DisplayCurrency, type FxRatesDto, formatMoney } from '@abaya/contracts';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLocale } from '@/components/i18n/locale-provider';
import { api } from './api-client';
import { COUNTRY_COOKIE, currencyForCountry, GEO_RESET_COOKIE } from './geo';

/**
 * The display currency: rupees (what everything is priced and charged in), or dirhams / Saudi
 * riyals converted at today's rate. The default follows the visitor's country (Saudi Arabia: SAR,
 * the rest of the Gulf: AED, India and elsewhere: INR; lib/geo.ts), and without a known country the
 * page language (Arabic: AED, English: INR). The header switch overrides it, remembered in this
 * browser. Nothing is ever charged in AED or SAR (checkout says so).
 */
const KEY = 'abaya.currency';
const EVENT = 'abaya:currency';
/** Used until the API's rate arrives, and when it is down: close to the 2026 rate, never far off. */
const FALLBACK: Record<DisplayCurrency, number> = { AED: 0.038, SAR: 0.039 };

const isCurrency = (v: string | null): v is Currency => !!v && (CURRENCIES as readonly string[]).includes(v);
const read = (): Currency | null => {
  try {
    const v = window.localStorage.getItem(KEY);
    return isCurrency(v) ? v : null;
  } catch {
    return null;
  }
};
const cookie = (name: string): string | null => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/\./g, '\\.')}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
};
/** The visitor's country, as the middleware saw it (null on the server and when unknown). */
const readCountry = (): string | null => cookie(COUNTRY_COOKIE);

/** The currency the visitor's country starts with: what the switch offers next to rupees. */
export function useGeoCurrency(): Currency | null {
  return currencyForCountry(useSyncExternalStore(subscribe, readCountry, () => null));
}
const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(EVENT, cb);
  };
};

export function useCurrency(): { currency: Currency; setCurrency: (c: Currency) => void; rate: number; source: FxRatesDto['source'] | 'loading' } {
  const locale = useLocale();
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const geo = useGeoCurrency();
  useEffect(forgetAfterGeoTest, []);
  const currency: Currency = stored ?? geo ?? (locale === 'ar' ? 'AED' : 'INR');
  const rates = useQuery({
    queryKey: ['fx-rates'],
    queryFn: ({ signal }) => api<FxRatesDto>('/pricing/rates', { anonymous: true, signal }),
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    enabled: currency !== 'INR',
  });
  const setCurrency = useCallback((c: Currency) => {
    try {
      window.localStorage.setItem(KEY, c);
    } catch {
      // Private window: the choice lasts for this page only.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { currency, setCurrency, rate: currency === 'INR' ? 1 : (rates.data?.rates[currency] ?? FALLBACK[currency]), source: rates.data?.source ?? 'loading' };
}

/** After a `?country=XX` test visit the saved currency is forgotten once, so the country's default shows. */
function forgetAfterGeoTest() {
  if (cookie(GEO_RESET_COOKIE) !== '1') return;
  document.cookie = `${GEO_RESET_COOKIE}=; path=/; max-age=0`;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Private window: nothing was saved.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** A formatter for amounts in paise, in the display currency. */
export function useMoney(): (paise: number) => string {
  const { currency, rate } = useCurrency();
  const locale = useLocale();
  return useCallback((paise: number) => formatMoney(paise, { currency, rate, locale }), [currency, rate, locale]);
}
