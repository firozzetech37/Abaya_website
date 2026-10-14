'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from '@/components/i18n/navigation';

const VERSION = process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown';
/** How often an open page asks whether a newer version is live. */
const CHECK_EVERY_MS = 60_000;
/** Pages where a reload could cost her something (payment, signing in): never reloaded by themselves. */
const BUSY_PAGES = /\/(checkout|login)(\/|$)/;

/** Load the page fresh from the network: drop any cached files first, then reload (or go to `href`). */
async function hardLoad(href?: string) {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    // Load anyway.
  }
  if (href) window.location.assign(href);
  else window.location.reload();
}

/** A plain click on a link to another page of this website (not a new tab, download or same-page anchor). */
function pageLink(e: MouseEvent): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url.href;
}

/**
 * Production only:
 * - registers the service worker (public/sw.js): the website becomes installable as an app and
 *   shows an offline page without a connection;
 * - updates itself after every deploy, with no notice: every minute, and whenever the tab comes
 *   back into view, it asks /api/version which commit is live. When a newer one is, the new
 *   version is loaded at the next safe moment: her next click to another page loads that page
 *   fresh, and leaving or coming back to the tab reloads it quietly. Never while she is busy:
 *   a dialog is open (e.g. a try-on), she has typed on this page, or she is at checkout or signing
 *   in. Try-ons she left running survive a reload (lib/ai-watch.ts keeps them for the session).
 */
export function Pwa() {
  const pathname = usePathname();
  const stale = useRef(false);
  const typed = useRef(false);
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }

    const busy = () =>
      typed.current ||
      BUSY_PAGES.test(window.location.pathname) ||
      Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
    const reloadIfIdle = () => {
      if (stale.current && !busy()) void hardLoad();
    };

    let stopped = false;
    const check = async () => {
      if (stopped || stale.current) return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (version && version !== 'unknown' && version !== 'local' && VERSION !== 'local' && version !== VERSION) {
          stale.current = true;
          if (document.visibilityState === 'hidden') reloadIfIdle();
        }
      } catch {
        // Offline or the server is busy: try again later.
      }
    };
    const onVisibility = () => {
      if (stale.current) reloadIfIdle();
      else if (document.visibilityState === 'visible') void check();
    };
    // A click to another page: load that page fresh instead of moving inside the old version.
    const onClick = (e: MouseEvent) => {
      if (!stale.current) return;
      const href = pageLink(e);
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      void hardLoad(href);
    };
    const onInput = () => {
      typed.current = true;
    };

    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('click', onClick, true);
    document.addEventListener('input', onInput, true);
    window.addEventListener('focus', check);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('input', onInput, true);
      window.removeEventListener('focus', check);
    };
  }, []);

  // She moved to another page some other way (a button that navigates): load it fresh.
  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    typed.current = false;
    if (stale.current) void hardLoad();
  }, [pathname]);

  return null;
}
