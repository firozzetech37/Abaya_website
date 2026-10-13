'use client';

import type { CollectionDto, DesignCard as DesignCardDto, DesignFacets, Paginated } from '@abaya/contracts';
import { ArrowRight, LayoutGrid } from 'lucide-react';
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, Skeleton } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage } from '@/lib/api-client';
import { useDesignFacets, useDesignsInfinite } from '@/lib/queries/catalog';
import { cn } from '@/lib/utils';
import { CollectionsStrip } from './catalog/collections-strip';
import { EditorialBreak } from './catalog/editorial-break';
import { FilterBar } from './catalog/filter-bar';
import { StyleShelf } from './catalog/style-shelf';
import { StyleTiles } from './catalog/style-tiles';
import { useCatalogParams } from './catalog/use-catalog-params';
import { DesignCard, DesignGrid } from './design-card';

/** A boutique banner after every this many designs in the grid. */
const BREAK_EVERY = 12;

/**
 * The shop page. Style tiles on top, then a filter bar that stays under the header. With no
 * filter the page shows one shelf per style (and the collections); any filter, a chosen style or
 * "Browse all" shows the full grid with a "Showing 24 of 120" counter and "Load more".
 * Filters live in the URL so they can be shared. The first page arrives server-rendered.
 */
export function CatalogBrowser({
  initialPage,
  initialFacets,
  collections,
  fixedCollection,
}: {
  initialPage: Paginated<DesignCardDto> | null;
  initialFacets?: DesignFacets | null;
  collections: CollectionDto[];
  /** On /collections/[slug] the collection is fixed and its filter hidden. */
  fixedCollection?: string;
}) {
  const { catalog, common } = useStrings();
  const params = useCatalogParams(fixedCollection);
  const isDefault = params.activeCount === 0 && params.sort === 'newest';
  const facetsQuery = useDesignFacets(params.filters, isDefault && !fixedCollection ? initialFacets : undefined);
  const facets = facetsQuery.data;
  const query = useDesignsInfinite(params.filters, isDefault && initialPage ? initialPage : undefined);

  const stocked = facets?.styles.filter((s) => s.count > 0) ?? [];
  // Shelves only make sense on the main shop page, with nothing chosen and at least two styles.
  const shelves = !fixedCollection && isDefault && params.view !== 'grid' && stocked.length >= 2;

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = facets?.total;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  return (
    <div>
      <section aria-labelledby="shop-by-style" className="mb-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 id="shop-by-style" className="font-display text-2xl sm:text-3xl">
              {catalog.shopByStyle}
            </h2>
            <p className="mt-1 text-sm text-neutral-600">{catalog.shopByStyleBody}</p>
          </div>
        </div>
        <StyleTiles facets={facets} active={params.style} onPick={(style) => params.set({ style, view: style ? undefined : params.view })} />
      </section>

      <FilterBar params={params} facets={facets} collections={collections} fixedCollection={fixedCollection} total={total} />

      <div className="mt-10">
        {shelves ? (
          <div className="space-y-16 sm:space-y-20">
            {stocked.map((s, i) => (
              <Fragment key={s.style}>
                <StyleShelf style={s.style} count={s.count} index={i} onSeeAll={() => {
                  params.set({ style: s.style });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }} />
                {i === 0 && <CollectionsStrip collections={collections} />}
                {i % 2 === 1 && i < stocked.length - 1 && <EditorialBreak index={(i - 1) / 2} />}
              </Fragment>
            ))}
            <div className="flex justify-center border-t border-border pt-10">
              <Button size="lg" variant="secondary" onClick={() => params.set({ view: 'grid' })}>
                <LayoutGrid className="size-4" aria-hidden />
                {catalog.browseGrid(total ?? 0)}
              </Button>
            </div>
          </div>
        ) : query.isError && items.length === 0 ? (
          <Alert tone="danger" title={errorMessage(query.error)} action={<Button size="sm" variant="secondary" onClick={() => void query.refetch()}>{common.retry}</Button>} />
        ) : query.isPending ? (
          <GridSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            title={catalog.empty}
            action={
              params.activeCount > 0 && (
                <Button variant="secondary" onClick={params.clear}>
                  {catalog.clearFilters}
                </Button>
              )
            }
          />
        ) : (
          <div aria-busy={query.isFetching} className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
            <DesignGrid>
              {items.map((d, i) => (
                <Fragment key={d.id}>
                  <li>
                    <DesignCard design={d} priority={i < 2} />
                  </li>
                  {(i + 1) % BREAK_EVERY === 0 && i < items.length - 1 && (
                    <li className="col-span-full">
                      <EditorialBreak index={(i + 1) / BREAK_EVERY - 1} />
                    </li>
                  )}
                </Fragment>
              ))}
            </DesignGrid>
            <div className="mt-14 flex flex-col items-center gap-4">
              {total !== undefined && total > 0 && (
                <div className="w-full max-w-xs text-center">
                  <p className="text-sm text-neutral-600" aria-live="polite">
                    {catalog.showing(Math.min(items.length, total), total)}
                  </p>
                  <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-sand-200">
                    <div className="h-full rounded-full bg-accent-800 transition-[width] duration-500" style={{ width: `${Math.min(100, (items.length / total) * 100)}%` }} />
                  </div>
                </div>
              )}
              {hasNextPage ? (
                <Button variant="secondary" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                  {isFetchingNextPage ? catalog.loadingMore : catalog.loadMore}
                  {!isFetchingNextPage && <ArrowRight className="size-4 rotate-90" aria-hidden />}
                </Button>
              ) : (
                items.length > 8 && <p className="text-sm text-muted">{catalog.end}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <DesignGrid>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="space-y-3">
          <Skeleton className="aspect-[3/4] rounded-b-2xl rounded-t-full" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-20" />
        </li>
      ))}
    </DesignGrid>
  );
}
