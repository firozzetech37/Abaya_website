'use client';

import type { AdminWaitlistDto } from '@abaya/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api-client';

/** Customers waiting for ordering to open, newest first. */
export function useOrderingWaitlist() {
  return useInfiniteQuery({
    queryKey: ['ordering-waitlist'],
    queryFn: ({ pageParam, signal }) => api.get<AdminWaitlistDto>('/admin/ordering-waitlist', { cursor: pageParam, limit: 50 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
