'use client';

import * as React from 'react';
import { DEFAULT_LOCALE, type Dictionary, dictionaryFor, type Locale } from '@/content/i18n';

const LocaleContext = React.createContext<Locale>(DEFAULT_LOCALE);

/** Set once per page by app/[lang]/layout.tsx. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => React.useContext(LocaleContext);

/** The website's text in the current language. */
export const useStrings = (): Dictionary => dictionaryFor(React.useContext(LocaleContext));
