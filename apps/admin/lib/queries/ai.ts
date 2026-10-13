'use client';

import type { AdminDesignDetail, AiInsightsDto, AiStatusDto, ApplyAiSuggestionBody, ReferenceDto } from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { qk } from './keys';

/** Poll while images are still being analysed, then stop. */
const pollWhilePending = (data: AiInsightsDto | undefined) => (data?.status === 'PENDING' ? 4_000 : false);

/** GET /v1/admin/designs/:id/ai → progress, suggestions and look-alikes. */
export function useDesignAi(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.ai.design(id ?? ''),
    queryFn: () => api.get<AiInsightsDto>(`/admin/designs/${id}/ai`),
    enabled: Boolean(id),
    refetchInterval: (q) => pollWhilePending(q.state.data),
  });
}

export function useReferenceAi(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.ai.reference(id ?? ''),
    queryFn: () => api.get<AiInsightsDto>(`/admin/references/${id}/ai`),
    enabled: Boolean(id) && enabled,
    refetchInterval: (q) => pollWhilePending(q.state.data),
  });
}

/** AI service health (shown when analysis seems stuck). */
export function useAiStatus(enabled = true) {
  return useQuery({
    queryKey: qk.ai.status,
    queryFn: () => api.get<AiStatusDto>('/admin/ai/status'),
    enabled,
    staleTime: 30_000,
  });
}

export function useApplyDesignAi(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyAiSuggestionBody) => api.post<AdminDesignDetail>(`/admin/designs/${id}/ai/apply`, body),
    onSuccess: (detail) => {
      qc.setQueryData(qk.designs.detail(id), detail);
      void qc.invalidateQueries({ queryKey: qk.ai.design(id) });
      void qc.invalidateQueries({ queryKey: ['designs', 'list'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useDismissDesignAi(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/admin/designs/${id}/ai/dismiss`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.ai.design(id) }),
  });
}

export function useApplyReferenceAi(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyAiSuggestionBody) => api.post<ReferenceDto>(`/admin/references/${id}/ai/apply`, body),
    onSuccess: (ref) => {
      qc.setQueryData(qk.references.detail(id), ref);
      void qc.invalidateQueries({ queryKey: qk.ai.reference(id) });
      void qc.invalidateQueries({ queryKey: ['references', 'list'] });
    },
  });
}

export function useDismissReferenceAi(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/admin/references/${id}/ai/dismiss`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.ai.reference(id) }),
  });
}
