'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { Link, usePathname } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { useNewestTryOnSlug } from '@/lib/queries/catalog';
import { OPEN_TRYON_EVENT, tryOnHref } from '@/lib/try-on-link';
import { cn } from '@/lib/utils';

/**
 * At the top of the home page hero: "✨ Virtual Try On · See yourself in our new abayas →" in big
 * wine-and-gold text straight on the page (no background), softly blinking (still for reduced
 * motion), on the hero's own background. It opens the try-on window on the newest abaya (the one
 * the hero shows first); signed-out visitors log in first.
 */
export function TryOnBanner({ className }: { className?: string }) {
  const { nav } = useStrings();
  const pathname = usePathname();
  const slug = useNewestTryOnSlug().data ?? null;

  const href = slug ? tryOnHref(slug) : '/#try-on';


  return (
    <div className={cn('tryon-banner relative', className)}>
      <Link
        href={href}
        onClick={(e) => {
          // Already on that abaya's page: open its try-on window here.
          if (slug && pathname === `/abayas/${slug}`) {
            e.preventDefault();
            window.dispatchEvent(new Event(OPEN_TRYON_EVENT));
          }
        }}
        className="group flex cursor-pointer items-center justify-center gap-3 px-4 py-4 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500 sm:gap-5 sm:py-6"
      >
        {/* The whole line blinks softly (globals.css .tryon-banner-blink) */}
        <span className="tryon-banner-blink flex items-center gap-3 sm:gap-5">
          <Sparkles className="size-7 shrink-0 text-gold-500 sm:size-10" aria-hidden />
          {/* Phones: the title on one line, the message under it. Wider screens: side by side. */}
          <span className="flex flex-col items-start leading-tight sm:flex-row sm:items-center sm:gap-5">
            <span className="whitespace-nowrap font-display text-3xl font-semibold text-accent-900 decoration-gold-400 decoration-2 underline-offset-8 group-hover:underline sm:text-5xl lg:text-6xl">{nav.tryOnBanner}</span>
            <span aria-hidden className="hidden h-10 w-px bg-gold-400 sm:block" />
            <span className="text-base font-medium text-accent-800 sm:text-2xl lg:text-3xl">{nav.tryOnBannerBody}</span>
          </span>
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(160deg,#E9D49A_0%,#CCA24A_55%,#B48734_100%)] text-accent-950 shadow-[0_10px_24px_-10px_rgba(107,31,42,0.6)] transition-transform group-hover:translate-x-1 group-active:scale-95 rtl:group-hover:-translate-x-1 sm:size-14">
            <ArrowRight className="size-5 rtl:-scale-x-100 sm:size-7" aria-hidden />
          </span>
        </span>
      </Link>
    </div>
  );
}
