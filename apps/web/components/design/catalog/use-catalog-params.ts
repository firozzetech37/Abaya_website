'use client';

import { ABAYA_STYLES, type AbayaStyle } from '@abaya/contracts';
import { usePathname, useRouter, useSearchParams } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import type { PriceRange, SortId } from '@/content/strings';
import type { DesignFilters } from '@/lib/queries/catalog';

const isStyle = (v: string | null): v is AbayaStyle => !!v && (ABAYA_STYLES as readonly string[]).includes(v);
const SORTS: readonly SortId[] = ['newest', 'price_asc', 'price_desc'];
const isSort = (v: string | null): v is SortId => SORTS.includes(v as SortId);

export type CatalogParamKey = 'style' | 'collection' | 'colour' | 'price' | 'sort' | 'q' | 'view';

export interface CatalogParams {
  style?: AbayaStyle;
  collection?: string;
  colour?: string;
  price?: PriceRange;
  sort: SortId;
  q?: string;
  /** "grid": the full grid even with no filter (the shop page shows style shelves otherwise). */
  view?: 'grid';
  filters: DesignFilters;
  /** Filters the visitor chose (style, collection, colour, price, search), not counting sort. */
  activeCount: number;
  set: (changes: Partial<Record<CatalogParamKey, string | undefined>>) => void;
  clear: () => void;
}

/**
 * The shop page's filters, kept in the URL (?style=&collection=&colour=&price=&sort=&q=&view=)
 * so a filtered page can be shared. `fixedCollection`: on a collection page it never changes.
 */
export function useCatalogParams(fixedCollection?: string): CatalogParams {
  const { catalog } = useStrings();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const style = isStyle(params.get('style')) ? (params.get('style') as AbayaStyle) : undefined;
  const collection = fixedCollection ?? (params.get('collection') || undefined);
  const colour = params.get('colour') || undefined;
  const price = catalog.priceRanges.find((p) => p.id === params.get('price'));
  const sort: SortId = isSort(params.get('sort')) ? (params.get('sort') as SortId) : 'newest';
  const q = params.get('q')?.trim().slice(0, 80) || undefined;
  const view = params.get('view') === 'grid' ? 'grid' : undefined;

  const filters: DesignFilters = {
    sort,
    ...(style ? { style } : {}),
    ...(collection ? { collection } : {}),
    ...(colour ? { colour } : {}),
    ...(q ? { q } : {}),
    ...(price?.min !== undefined ? { minPriceInPaise: price.min } : {}),
    ...(price?.max !== undefined ? { maxPriceInPaise: price.max } : {}),
  };
  const activeCount = [style, fixedCollection ? undefined : collection, colour, price, q].filter(Boolean).length;

  const replace = (next: URLSearchParams) => {
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const set: CatalogParams['set'] = (changes) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    replace(next);
  };
  const clear = () => {
    const next = new URLSearchParams();
    if (view) next.set('view', view);
    replace(next);
  };

  return { style, collection, colour, price, sort, q, view, filters, activeCount, set, clear };
}
