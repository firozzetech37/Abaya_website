import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Dates in the page's language (Arabic month names, Western digits); English on the server. */
const pageLocale = () =>
  typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar-u-nu-latn' : 'en-IN';

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat(pageLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat(pageLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/**
 * Only allow same-site redirects (prevents open redirects via ?redirect_url=).
 * Accepts a relative path, or an absolute URL on `origin` (Clerk sometimes sends those), and
 * returns a relative path.
 */
export function safeNext(next: string | null | undefined, fallback = '/account', origin?: string): string {
  if (!next) return fallback;
  if (origin && /^https?:\/\//i.test(next)) {
    try {
      const url = new URL(next);
      if (url.origin !== origin) return fallback;
      next = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (next === '/login' || next.startsWith('/login/') || next.startsWith('/login?')) return fallback;
  return next;
}

/** The login page URL that sends the user back to `returnTo` afterwards. */
export const loginHref = (returnTo: string): string => `/login?redirect_url=${encodeURIComponent(returnTo)}`;
