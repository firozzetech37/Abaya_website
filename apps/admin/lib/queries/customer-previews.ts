'use client';

import type { AdminCustomerPreviewDto, AdminCustomerPreviewSummaryDto, Paginated } from '@abaya/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { qk } from './keys';

/** Newest previews; `userId`: only that customer's. */
export function useCustomerPreviews(userId?: string | null) {
  return useInfiniteQuery({
    queryKey: [...qk.customerPreviews.list, userId ?? 'all'],
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<AdminCustomerPreviewDto>>(
        '/admin/customer-previews',
        { cursor: pageParam, limit: 24, ...(userId ? { userId } : {}) },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useCustomerPreviewSummary() {
  return useQuery({
    queryKey: qk.customerPreviews.summary,
    queryFn: () => api.get<AdminCustomerPreviewSummaryDto>('/admin/customer-previews/summary'),
  });
}

export function useHideCustomerPreview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => api.patch<void>(`/admin/customer-previews/${id}`, { hidden }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-previews'] }),
  });
}
