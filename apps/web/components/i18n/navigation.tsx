'use client';

/**
 * Language-aware versions of next/navigation and next/link: paths are written without a
 * language (`/bag`) and become `/ar/bag` on Arabic pages; `usePathname` returns the path
 * without the language, so comparisons like `pathname === '/bag'` work in both.
 */
import NextLink from 'next/link';
import { usePathname as useNextPathname, useRouter as useNextRouter } from 'next/navigation';
import * as React from 'react';
import { localizePath, stripLocale } from '@/content/i18n';
import { useLocale } from './locale-provider';

export { useParams, useSearchParams } from 'next/navigation';

type NextRouter = ReturnType<typeof useNextRouter>;

export function useRouter(): NextRouter {
  const router = useNextRouter();
  const locale = useLocale();
  return React.useMemo(
    () => ({
      ...router,
      push: (href, options) => router.push(localizePath(locale, href), options),
      replace: (href, options) => router.replace(localizePath(locale, href), options),
      prefetch: (href, options) => router.prefetch(localizePath(locale, href), options),
    }),
    [router, locale],
  );
}

export function usePathname(): string {
  return stripLocale(useNextPathname() ?? '/');
}

/** A path in the current language, for plain <a> tags and window.location. */
export function useLocalizePath(): (path: string) => string {
  const locale = useLocale();
  return React.useCallback((path: string) => localizePath(locale, path), [locale]);
}

type LinkProps = React.ComponentProps<typeof NextLink>;

/** next/link that keeps the visitor in their language. */
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, ...props }, ref) {
  const locale = useLocale();
  const localized =
    typeof href === 'string'
      ? localizePath(locale, href)
      : href.pathname
        ? { ...href, pathname: localizePath(locale, href.pathname) }
        : href;
  return <NextLink ref={ref} href={localized} {...props} />;
});
