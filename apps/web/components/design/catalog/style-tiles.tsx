'use client';

import type { AbayaStyle, DesignFacets } from '@abaya/contracts';
import { useStrings } from '@/components/i18n/locale-provider';
import { StarPattern } from '@/components/ornament/geometric';
import { Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { DesignImage } from '../design-image';

/**
 * "Shop by style": one arched picture tile per silhouette (the newest design of that style), with
 * how many designs it has under the current filters. The first tile shows everything. Styles with
 * no design are left out, unless chosen. Scrolls sideways on phones, one row on wide screens.
 */
export function StyleTiles({
  facets,
  active,
  onPick,
}: {
  facets: DesignFacets | undefined;
  active?: AbayaStyle;
  onPick: (style: AbayaStyle | undefined) => void;
}) {
  const { catalog, styles } = useStrings();

  if (!facets) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="w-28 shrink-0 space-y-2 sm:w-36">
            <Skeleton className="aspect-[3/4] rounded-b-2xl rounded-t-full" />
            <Skeleton className="mx-auto h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const shown = facets.styles.filter((s) => s.count > 0 || s.style === active);
  const cover = shown.find((s) => s.imageUrl)?.imageUrl ?? null;
  const tiles: { key: string; style: AbayaStyle | undefined; label: string; count: number; imageUrl: string | null }[] = [
    { key: 'all', style: undefined, label: catalog.allDesigns, count: facets.styles.reduce((n, s) => n + s.count, 0), imageUrl: null },
    ...shown.map((s) => ({ key: s.style, style: s.style, label: styles[s.style], count: s.count, imageUrl: s.imageUrl })),
  ];

  return (
    <div
      role="group"
      aria-label={catalog.shopByStyle}
      className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 pt-1 scrollbar-none sm:gap-5 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0"
    >
      {tiles.map((t) => {
        const on = active === t.style;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(t.style)}
            className="group w-[6.75rem] shrink-0 snap-start text-center focus-visible:outline-none sm:w-36 lg:w-auto"
          >
            <span
              className={cn(
                'relative block aspect-[3/4] overflow-hidden rounded-b-2xl rounded-t-full border bg-sand-100 transition-[box-shadow,border-color,transform] duration-500 group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-accent-500 group-focus-visible:ring-offset-2',
                on
                  ? 'border-gold-400 shadow-[0_24px_40px_-24px_rgba(68,17,27,0.6)] ring-2 ring-gold-400 ring-offset-[3px] ring-offset-background'
                  : 'border-transparent group-hover:shadow-[0_24px_40px_-24px_rgba(68,17,27,0.55)]',
              )}
            >
              {t.style ? (
                <DesignImage
                  src={t.imageUrl}
                  alt=""
                  name={t.label}
                  sizes="(min-width: 1024px) 14vw, 9rem"
                  className="aspect-[3/4] [&_img]:transition-transform [&_img]:duration-[1200ms] [&_img]:ease-out group-hover:[&_img]:scale-[1.07]"
                />
              ) : (
                // "All designs": the atelier's deep wine with a star lattice and the newest photo faintly behind.
                <span className="absolute inset-0 bg-accent-950">
                  {cover && (
                    <DesignImage src={cover} alt="" name={t.label} sizes="9rem" className="aspect-[3/4] opacity-30 mix-blend-luminosity" />
                  )}
                  <StarPattern className="text-gold-300/25" size={40} />
                  <span className="absolute inset-0 flex items-center justify-center font-display text-4xl text-gold-200">
                    {t.count}
                  </span>
                </span>
              )}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-1.5 rounded-b-xl rounded-t-full border border-white/0 transition-colors duration-700 group-hover:border-white/50"
              />
            </span>
            <span className={cn('mt-3 block font-display text-lg leading-tight transition-colors', on ? 'text-accent-800' : 'text-foreground group-hover:text-accent-800')}>
              {t.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted">{catalog.designsCount(t.count)}</span>
          </button>
        );
      })}
    </div>
  );
}
