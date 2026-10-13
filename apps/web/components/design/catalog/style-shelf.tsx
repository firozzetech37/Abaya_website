'use client';

import type { AbayaStyle } from '@abaya/contracts';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import { useLocale, useStrings } from '@/components/i18n/locale-provider';
import { Skeleton } from '@/components/ui/misc';
import { useStyleShelf } from '@/lib/queries/catalog';
import { DesignCard } from '../design-card';

const SHELF_SIZE = 8;
const item = 'w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%]';

/**
 * One style as a shelf: its name, a line about the silhouette and how many designs it has, then
 * its newest designs in a row that slides sideways (arrows on wide screens, swipe on phones).
 * "See all" opens the style's full grid.
 */
export function StyleShelf({ style, count, index, onSeeAll }: { style: AbayaStyle; count: number; index: number; onSeeAll: () => void }) {
  const { catalog, styles } = useStrings();
  const rtl = useLocale() === 'ar';
  const query = useStyleShelf(style, SHELF_SIZE);
  const row = useRef<HTMLUListElement>(null);
  const slide = (dir: 1 | -1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: 'smooth' });
  };
  const items = query.data?.items ?? [];
  const headingId = `shelf-${style}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-gold-600">
            <span className="tabular-nums">{String(index + 1).padStart(2, '0')}</span>
            <span aria-hidden className="h-px w-6 bg-gold-400" />
            {catalog.designsCount(count)}
          </p>
          <h2 id={headingId} className="font-display text-3xl leading-tight sm:text-4xl">
            {styles[style]}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">{catalog.styleNotes[style]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {count > 4 && (
            <span className="hidden gap-2 lg:flex">
              <button
                type="button"
                onClick={() => slide(-1)}
                aria-label={catalog.shelfPrev}
                className="inline-flex size-11 items-center justify-center rounded-full border border-neutral-300 bg-surface transition-colors hover:border-accent-800 hover:text-accent-800"
              >
                <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => slide(1)}
                aria-label={catalog.shelfNext}
                className="inline-flex size-11 items-center justify-center rounded-full border border-neutral-300 bg-surface transition-colors hover:border-accent-800 hover:text-accent-800"
              >
                <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={onSeeAll}
            className="group inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-accent-800 transition-colors hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            {catalog.seeAllCount(count)}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden />
          </button>
        </div>
      </div>
      {/* Padding gives the cards room to lift on hover inside the scrolling row. */}
      <ul ref={row} className="-mx-4 flex snap-x snap-mandatory gap-x-4 overflow-x-auto px-4 pb-6 pt-4 scrollbar-none sm:-mx-3 sm:gap-x-7 sm:px-3 lg:gap-x-8">
        {query.isPending
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className={`${item} space-y-3`}>
                <Skeleton className="aspect-[3/4] rounded-b-2xl rounded-t-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-20" />
              </li>
            ))
          : items.map((d) => (
              <li key={d.id} className={item}>
                <DesignCard design={d} />
              </li>
            ))}
      </ul>
    </section>
  );
}
