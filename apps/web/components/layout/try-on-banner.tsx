'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { Link, usePathname } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { useNewestTryOnSlug } from '@/lib/queries/catalog';
import { OPEN_TRYON_EVENT, tryOnHref } from '@/lib/try-on-link';

/**
 * Under the navbar on every page: "✨ Virtual Try On · See yourself in our new abayas →", with a
 * soft glow pulse, a twinkling sparkle, a gold sheen and a nudging arrow (no hard blinking; still
 * for reduced motion). It opens the try-on window on the newest abaya (the one the home hero
 * shows first); signed-out visitors log in first. Always shown (not on the login page).
 */
export function TryOnBanner() {
  const { nav } = useStrings();
  const pathname = usePathname();
  const slug = useNewestTryOnSlug().data ?? null;
  if (pathname.startsWith('/login')) return null;

  const href = slug ? tryOnHref(slug) : '/#try-on';


  return (
    <div className="tryon-banner relative isolate overflow-hidden border-b border-gold-300/40 bg-[linear-gradient(90deg,#44111B_0%,#7C2B3A_45%,#93394B_55%,#44111B_100%)] text-white">
      <span aria-hidden className="tryon-banner-glow pointer-events-none absolute inset-0 -z-10" />
      <span aria-hidden className="tryon-banner-sheen pointer-events-none absolute inset-y-0 -start-1/3 -z-10 w-1/3" />
      <Link
        href={href}
        onClick={(e) => {
          // Already on that abaya's page: open its try-on window here.
          if (slug && pathname === `/abayas/${slug}`) {
            e.preventDefault();
            window.dispatchEvent(new Event(OPEN_TRYON_EVENT));
          }
        }}
        className="group flex min-h-16 items-center justify-center gap-3 px-4 py-3 text-center sm:min-h-[4.75rem] sm:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-200"
      >
        <Sparkles className="tryon-banner-spark size-5 shrink-0 text-gold-200 sm:size-7" aria-hidden />
        {/* Phones: the title on one line, the message under it. Wider screens: side by side. */}
        <span className="flex flex-col items-start leading-tight sm:flex-row sm:items-center sm:gap-4">
          <span className="whitespace-nowrap font-display text-xl font-semibold tracking-wide text-gold-100 sm:text-3xl">{nav.tryOnBanner}</span>
          <span aria-hidden className="hidden h-7 w-px bg-gold-200/50 sm:block" />
          <span className="text-sm text-white/90 sm:text-lg lg:text-xl">{nav.tryOnBannerBody}</span>
        </span>
        <span className="tryon-banner-arrow inline-flex size-9 shrink-0 sm:size-11 items-center justify-center rounded-full bg-gold-300 text-accent-950 shadow-[0_0_14px_rgba(233,212,154,0.7)] transition-colors group-hover:bg-gold-200">
          <ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden />
        </span>
      </Link>
    </div>
  );
}
