'use client';

import type { AdminDesignDetail, AdminDesignListItem, DesignStatus, Paginated } from '@abaya/contracts';
import {
  type attachDesignImageBody,
  type createDesignBody,
  type setDesignOptionsBody,
  type updateDesignBody,
  type updateDesignImagesBody,
} from '@abaya/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '../api-client';
import { qk } from './keys';

export interface DesignListParams {
  status?: DesignStatus;
  q?: string;
  mine?: boolean;
}

export function useDesigns(params: DesignListParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.designs.list(params),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<AdminDesignListItem>>(
        '/admin/designs',
        { status: params.status, q: params.q, mine: params.mine ? 'true' : undefined, cursor: pageParam, limit: 30 },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export function useDesign(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.designs.detail(id ?? ''),
    queryFn: () => api.get<AdminDesignDetail>(`/admin/designs/${id}`),
    enabled: Boolean(id),
  });
}

/** Every design mutation returns the fresh detail; write it to the cache and refresh lists. */
function useDesignMutation<TVars>(id: string, fn: (vars: TVars) => Promise<AdminDesignDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      qc.setQueryData(qk.designs.detail(id), detail);
      void qc.invalidateQueries({ queryKey: ['designs', 'list'] });
      // New or removed images change the AI analysis and look-alikes.
      void qc.invalidateQueries({ queryKey: qk.ai.design(id) });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useCreateDesign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createDesignBody>) => api.post<AdminDesignDetail>('/admin/designs', body),
    onSuccess: (detail) => {
      qc.setQueryData(qk.designs.detail(detail.id), detail);
      void qc.invalidateQueries({ queryKey: qk.designs.all });
      void qc.invalidateQueries({ queryKey: qk.references.all });
    },
  });
}

export const useUpdateDesign = (id: string) =>
  useDesignMutation(id, (body: z.input<typeof updateDesignBody>) => api.patch<AdminDesignDetail>(`/admin/designs/${id}`, body));

export const useAttachDesignImage = (id: string) =>
  useDesignMutation(id, (body: z.input<typeof attachDesignImageBody>) =>
    api.post<AdminDesignDetail>(`/admin/designs/${id}/images`, body),
  );

export const useUpdateDesignImages = (id: string) =>
  useDesignMutation(id, (body: z.input<typeof updateDesignImagesBody>) =>
    api.patch<AdminDesignDetail>(`/admin/designs/${id}/images`, body),
  );

export const useDeleteDesignImage = (id: string) =>
  useDesignMutation(id, (imageId: string) => api.delete<AdminDesignDetail>(`/admin/designs/${id}/images/${imageId}`));

export const useSetDesignOptions = (id: string) =>
  useDesignMutation(id, (body: z.input<typeof setDesignOptionsBody>) =>
    api.put<AdminDesignDetail>(`/admin/designs/${id}/options`, body),
  );

/** The same transition on many designs, one after another (each audited); tells how many went through. */
export function useBulkTransitionDesigns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, to }: { ids: string[]; to: DesignStatus }) => {
      const failed: { id: string; error: unknown }[] = [];
      for (const id of ids) {
        try {
          await api.post<AdminDesignDetail>(`/admin/designs/${id}/transition`, { to });
        } catch (error) {
          failed.push({ id, error });
        }
      }
      return { done: ids.length - failed.length, failed };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['designs'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export const useTransitionDesign = (id: string) =>
  useDesignMutation(id, (body: { to: DesignStatus; notes?: string; duplicatesChecked?: boolean; originalityConfirmed?: boolean }) =>
    api.post<AdminDesignDetail>(`/admin/designs/${id}/transition`, body),
  );
