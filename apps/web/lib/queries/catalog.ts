'use client';

import type { AbayaStyle, DesignCard, DesignDetail, DesignFacets, ListDesignsQuery, Paginated, PriceBreakdown, QuoteBody } from '@abaya/contracts';
import { type InfiniteData, keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../api-client';
import { heroLooks } from '../hero';
import { qk } from './keys';

export type DesignFilters = Partial<
  Pick<ListDesignsQuery, 'style' | 'collection' | 'sort' | 'q' | 'colour' | 'minPriceInPaise' | 'maxPriceInPaise'>
>;

export const PAGE_SIZE = 12;

export function useDesignsInfinite(filters: DesignFilters, initialPage?: Paginated<DesignCard>) {
  return useInfiniteQuery({
    queryKey: qk.designs(filters),
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<DesignCard>>('/designs', {
        anonymous: true,
        signal,
        query: { ...filters, limit: PAGE_SIZE, cursor: pageParam ?? undefined },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: initialPage
      ? ({ pages: [initialPage], pageParams: [null] } satisfies InfiniteData<Paginated<DesignCard>, string | null>)
      : undefined,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Per-style and per-colour counts for the shop page's tiles and filters (sort is ignored). */
export function useDesignFacets(filters: DesignFilters, initial?: DesignFacets | null) {
  const { sort: _sort, ...rest } = filters;
  return useQuery({
    queryKey: ['designs', 'facets', rest] as const,
    queryFn: ({ signal }) => api<DesignFacets>('/designs/facets', { anonymous: true, signal, query: rest }),
    initialData: initial ?? undefined,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** The newest few designs of one style, for its shelf on the shop page. */
export function useStyleShelf(style: AbayaStyle, limit = 8) {
  return useQuery({
    queryKey: qk.designs({ style, sort: 'newest', limit }),
    queryFn: ({ signal }) =>
      api<Paginated<DesignCard>>('/designs', { anonymous: true, signal, query: { style, sort: 'newest', limit } }),
    staleTime: 60_000,
  });
}

/** The abaya the try-on banner opens: the newest one the home hero shows first. */
export function useNewestTryOnSlug() {
  return useQuery({
    queryKey: qk.designs({ sort: 'newest', limit: 30 }),
    queryFn: ({ signal }) => api<Paginated<DesignCard>>('/designs', { anonymous: true, signal, query: { sort: 'newest', limit: 30 } }),
    staleTime: 5 * 60_000,
    select: (page) => heroLooks(page.items)[0]?.slug ?? page.items[0]?.slug ?? null,
  });
}

/** One published design (quick view). The design page itself is server-rendered. */
export function useDesign(slug: string) {
  return useQuery({
    queryKey: qk.design(slug),
    queryFn: ({ signal }) => api<DesignDetail>(`/designs/${encodeURIComponent(slug)}`, { anonymous: true, signal }),
    staleTime: 60_000,
  });
}

/** Server price for a selection. `body` is null while the selection is incomplete. */
export function useQuote(body: QuoteBody | null) {
  return useQuery({
    queryKey: qk.quote(body),
    queryFn: ({ signal }) => api<PriceBreakdown>('/pricing/quote', { method: 'POST', body, anonymous: true, signal }),
    enabled: body !== null,
    staleTime: 30_000,
    retry: 1,
  });
}
