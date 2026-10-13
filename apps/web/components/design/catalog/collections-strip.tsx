'use client';

import type { CollectionDto } from '@abaya/contracts';
import { ArrowUpRight } from 'lucide-react';
import { Link } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { DesignImage } from '../design-image';

/** The atelier's collections as a slim row of cover cards that scrolls sideways. */
export function CollectionsStrip({ collections }: { collections: CollectionDto[] }) {
  const { catalog } = useStrings();
  const shown = collections.filter((c) => c.designCount > 0);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="catalog-collections">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id="catalog-collections" className="font-display text-3xl sm:text-4xl">
            {catalog.collectionsTitle}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">{catalog.collectionsBody}</p>
        </div>
      </div>
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0">
        {shown.map((c) => (
          <li key={c.id} className="w-[68%] shrink-0 snap-start sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)]">
            <Link
              href={`/collections/${c.slug}`}
              className="group relative block overflow-hidden rounded-[1.75rem] bg-accent-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
            >
              <DesignImage
                src={c.coverImageUrl}
                alt=""
                name={c.name}
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 68vw"
                className="aspect-[4/3] opacity-90 [&_img]:transition-transform [&_img]:duration-[1200ms] [&_img]:ease-out group-hover:[&_img]:scale-[1.06]"
              />
              <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-accent-950/90 via-accent-950/25 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 text-white">
                <span className="min-w-0">
                  <span className="block truncate font-display text-2xl leading-tight">{c.name}</span>
                  <span className="mt-0.5 block text-xs uppercase tracking-[0.2em] text-gold-200">{catalog.designsCount(c.designCount)}</span>
                </span>
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/40 transition-colors group-hover:border-gold-300 group-hover:bg-gold-300 group-hover:text-accent-950">
                  <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
