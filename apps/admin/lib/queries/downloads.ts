'use client';

import type { AdminDownloadDto, AdminDownloadsSummaryDto, Paginated } from '@abaya/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { qk } from './keys';

export function useAdminDownloads() {
  return useInfiniteQuery({
    queryKey: qk.downloads.list({}),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<AdminDownloadDto>>('/admin/downloads', { cursor: pageParam, limit: 30 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useDownloadsSummary() {
  return useQuery({ queryKey: qk.downloads.summary, queryFn: () => api.get<AdminDownloadsSummaryDto>('/admin/downloads/summary') });
}

/** Super admin: make the watermarked customer previews again for every live design. */
export function useRebuildPreviews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ designs: number; images: number }>('/admin/designs/rebuild-previews', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['designs'] }),
  });
}
