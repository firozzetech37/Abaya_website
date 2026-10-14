'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { usePathname } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';

const VERSION = process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown';
/** How often an open page asks whether a newer version is live. */
const CHECK_EVERY_MS = 60_000;

/** Reload from the network: drop any cached files first, then reload the page. */
async function hardReload() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    // Reload anyway.
  }
  window.location.reload();
}

/**
 * Production only:
 * - registers the service worker (public/sw.js): the website becomes installable as an app and
 *   shows an offline page without a connection;
 * - "hard refresh on deploy": every minute, and whenever the tab comes back into view, it asks
 *   /api/version which commit is live. When a newer one is, the page reloads itself, at a moment
 *   that never interrupts the visitor: right away if the tab is in the background, else on her
 *   next move to another page (a full page load instead of an in-app one). Meanwhile a small
 *   notice offers "Refresh" for anyone who wants the new version at once.
 */
export function Pwa() {
  const pathname = usePathname();
  const { nav } = useStrings();
  const words = useRef(nav);
  useEffect(() => {
    words.current = nav;
  }, [nav]);
  const stale = useRef(false);
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }

    let stopped = false;
    const check = async () => {
      if (stopped || stale.current) return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (version && version !== 'unknown' && version !== VERSION) {
          stale.current = true;
          if (document.visibilityState === 'hidden') void hardReload();
          else
            toast(words.current.updateAvailable, {
              id: 'new-version',
              duration: Infinity,
              action: { label: words.current.updateRefresh, onClick: () => void hardReload() },
            });
        }
      } catch {
        // Offline or the server is busy: try again later.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && stale.current) void hardReload();
      if (document.visibilityState === 'visible') void check();
    };
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', check);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', check);
    };
  }, []);

  // A newer version is live and she moved to another page: load it fresh.
  useEffect(() => {
    if (pathname !== firstPath.current && stale.current) void hardReload();
    firstPath.current = pathname;
  }, [pathname]);

  return null;
}
