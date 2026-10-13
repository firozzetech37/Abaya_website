'use client';

import { usePathname } from '@/components/i18n/navigation';
import { useEffect } from 'react';

/**
 * Fades elements marked `data-reveal` up into view the first time they scroll
 * on screen (styles in globals.css). Mounted once in the layout, so server
 * components only add the attribute; `style={{ '--reveal-delay': '120ms' }}`
 * staggers siblings. Content is only hidden when JS runs and motion is allowed.
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-shown', '');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    const scan = () => document.querySelectorAll('[data-reveal]:not([data-shown])').forEach((el) => io.observe(el));
    scan();
    // Streamed or client-rendered sections arrive after the first scan.
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  return null;
}
