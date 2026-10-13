import type {
  CollectionDto,
  DesignCard,
  DesignDetail,
  ListDesignsQuery,
  Paginated,
  PriceBreakdown,
  QuoteBody,
} from '@abaya/contracts';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../api-client';

export type DesignFilters = Partial<Omit<ListDesignsQuery, 'cursor' | 'limit'>>;

export function useDesigns(filters: DesignFilters, limit = 12) {
  return useInfiniteQuery({
    queryKey: ['designs', filters, limit],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<DesignCard>>('/designs', {
        auth: false,
        signal,
        query: { ...filters, limit, cursor: pageParam },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useDesign(slug: string | undefined) {
  return useQuery({
    queryKey: ['design', slug],
    enabled: Boolean(slug),
    queryFn: ({ signal }) => api<DesignDetail>(`/designs/${encodeURIComponent(slug ?? '')}`, { auth: false, signal }),
  });
}

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: ({ signal }) => api<CollectionDto[]>('/collections', { auth: false, signal }),
    staleTime: 5 * 60_000,
  });
}

/** Server price for a redesign; the caller debounces `body`. */
export function useQuote(body: QuoteBody | null) {
  return useQuery({
    queryKey: ['quote', body],
    enabled: body !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      api<PriceBreakdown>('/pricing/quote', { method: 'POST', body, auth: false, signal }),
  });
}
