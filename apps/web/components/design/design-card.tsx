'use client';

import type { DesignCard as DesignCardDto } from '@abaya/contracts';

import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import { Link } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { TiltCard } from '@/components/motion/tilt-card';
import { rememberFly } from '@/lib/fly';
import { cn } from '@/lib/utils';
import { DesignImage } from './design-image';
import { QuickView } from './quick-view';
import { WishlistButton } from './wishlist-button';
import { useMoney } from '@/lib/currency';

const MAX_DOTS = 3;

/**
 * A product card in the style of a magazine edit: an arched photo with a "New arrival" tag and a
 * heart floating at its open corners, the collection (or style) in small caps, the name in the
 * display serif, the price, the lead time and the colours it comes in. With a mouse, the card lifts
 * onto a gold-edged champagne panel and two buttons rise over the photo: Quick view (a dialog) and
 * Customize (the design page). The photo and the name both open the design page (not one
 * stretched link, which would sit above the buttons); on click the photo remembers where it is
 * so it can fly into the design page's gallery.
 */
export function DesignCard({ design, priority }: { design: DesignCardDto; priority?: boolean }) {
  const money = useMoney();
  const { common, home, styles } = useStrings();
  const [quick, setQuick] = useState(false);
  const dots = design.colours.slice(0, MAX_DOTS);
  const extra = design.colours.length - dots.length;
  const eyebrow = design.collectionName ? home.collectionTag(design.collectionName) : styles[design.style];
  const href = `/abayas/${design.slug}`;
  const remember = (e: MouseEvent<HTMLAnchorElement>) => {
    const frame = e.currentTarget.closest('article')?.querySelector('[data-fly]');
    if (frame && design.primaryImageUrl) rememberFly(design.primaryImageUrl, frame);
  };

  return (
    <article className="group relative">
      {/* With a mouse, the whole card lifts onto a champagne panel with a gold edge. */}
      <div className="relative -m-2 rounded-[1.75rem] border border-transparent p-2 transition-[background-color,border-color,box-shadow,transform] duration-500 sm:-m-3 sm:p-3 [@media(hover:hover)]:group-hover:-translate-y-1 [@media(hover:hover)]:group-hover:border-gold-300/80 [@media(hover:hover)]:group-hover:bg-surface [@media(hover:hover)]:group-hover:shadow-[0_30px_60px_-30px_rgba(180,135,52,0.45),0_1px_2px_rgba(35,28,23,0.05)]">
        <TiltCard max={3}>
          {/* An arch, like a doorway, with a thin gold arch drawn inside on hover. */}
          <div data-fly className="relative overflow-hidden rounded-b-2xl rounded-t-full bg-sand-100">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-2 z-10 rounded-b-xl rounded-t-full border border-gold-200/0 transition-colors duration-700 group-hover:border-gold-200/80"
            />
            {/* The photo opens the design (the name below is the keyboard link, so this one is skipped by Tab) */}
            <Link href={href} onClick={remember} tabIndex={-1} aria-hidden className="relative block">
              <DesignImage
                src={design.primaryImageUrl}
                alt={design.name}
                name={design.name}
                priority={priority}
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className={cn(
                  'aspect-[3/4] [&_img]:transition-[transform,filter] [&_img]:duration-[1200ms] [&_img]:ease-out [@media(hover:hover)]:group-hover:[&_img]:brightness-[0.88]',
                  !design.hoverImageUrl && 'group-hover:[&_img]:scale-[1.06]',
                )}
              />
              {design.hoverImageUrl && (
                // The second angle, as on a photoshoot contact sheet: fades in under the pointer.
                <DesignImage
                  src={design.hoverImageUrl}
                  alt=""
                  name={design.name}
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="absolute inset-0 aspect-[3/4] opacity-0 transition-opacity duration-700 ease-out [&_img]:brightness-[0.88] [@media(hover:hover)]:group-hover:opacity-100"
                />
              )}
            </Link>
            {/* Quick view and Customize rise in on hover or keyboard focus (never on touch screens) */}
            <div className="absolute inset-x-4 bottom-4 z-20 hidden flex-col gap-2 transition-all duration-500 [transform:translateZ(20px)] [@media(hover:hover)]:flex [@media(hover:hover)]:translate-y-4 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:translate-y-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100">
              <button
                type="button"
                onClick={() => setQuick(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-surface/95 text-sm font-medium text-foreground shadow-[0_12px_30px_-12px_rgba(35,28,23,0.5)] backdrop-blur transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                {home.quickView}
                <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
              </button>
              <Link
                href={href}
                onClick={remember}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent-900 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(204,162,74,0.7),0_14px_30px_-14px_rgba(46,13,20,0.8)] transition-colors hover:bg-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                {home.customise}
                <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
              </Link>
            </div>
          </div>
        </TiltCard>

        <div className="mt-4 space-y-1.5 px-1">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-600">
            <span className="size-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
            <span className="truncate">{eyebrow}</span>
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <h3 className="line-clamp-2 font-display text-xl leading-snug text-foreground transition-colors duration-300 group-hover:text-accent-800">
              <Link href={href} onClick={remember} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2">
                {design.name}
              </Link>
            </h3>
            {dots.length > 0 && (
              <span className="flex shrink-0 items-center gap-1 sm:mt-1.5" title={home.colours(design.colours.length)}>
                <span className="sr-only">{home.colours(design.colours.length)}</span>
                {dots.map((hex, i) => (
                  <span
                    key={`${hex}-${i}`}
                    aria-hidden
                    className="size-3.5 rounded-full border border-black/10 shadow-[inset_0_0_0_1.5px_#FFFCF6]"
                    style={{ backgroundColor: hex }}
                  />
                ))}
                {extra > 0 && <span className="ms-0.5 text-[10px] font-medium text-muted">{home.moreColours(extra)}</span>}
              </span>
            )}
          </div>
          <p className="text-[15px] text-neutral-800">
            <span className="text-sm text-muted">{common.from} </span>
            <span className="font-medium">{money(design.fromPriceInPaise)}</span>
          </p>
          <p className="flex items-center gap-1.5 text-xs text-neutral-600">
            <span className="size-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
            {home.madeToOrder(design.leadTimeDays)}
          </p>
        </div>
      </div>

      {/* Tag and heart float at the arch's open corners (outside the clipped frame, so never cut). */}
      {design.isNew && (
        <span className="pointer-events-none absolute start-0 top-[9%] z-20 rounded-full bg-accent-900 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.16em] text-white shadow-md sm:start-1 sm:text-[10px]">
          {home.newArrival}
        </span>
      )}
      <WishlistButton designId={design.id} variant="overlay" className="absolute end-0 top-[6%] z-20 sm:end-1" />

      {quick && <QuickView slug={design.slug} open={quick} onOpenChange={setQuick} />}
    </article>
  );
}

export function DesignGrid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-7 lg:grid-cols-4 lg:gap-x-8">{children}</ul>;
}
