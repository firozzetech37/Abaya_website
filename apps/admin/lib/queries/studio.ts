'use client';

import type {
  AdminDesignDetail,
  designFromImageBody,
  GenerationBody,
  GenerationDto,
  PinPreviewDto,
  PinterestBoardDto,
  PinterestPinDto,
  ReferenceDto,
  StudioLimitsDto,
  StudioSummaryDto,
} from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '../api-client';
import { qk } from './keys';

/** Designer Studio (/v1/studio): AI Design and Pinterest inspiration. */
export function useStudioSummary() {
  return useQuery({ queryKey: qk.studio.summary, queryFn: () => api.get<StudioSummaryDto>('/studio/summary') });
}

export function useStudioLimits() {
  return useQuery({ queryKey: qk.studio.limits, queryFn: () => api.get<StudioLimitsDto>('/studio/limits') });
}

const working = (g: GenerationDto) => g.status === 'QUEUED' || g.status === 'RUNNING';

/** History, polled while something is still being made. */
export function useGenerations() {
  return useQuery({
    queryKey: qk.studio.generations,
    queryFn: () => api.get<GenerationDto[]>('/studio/generations'),
    refetchInterval: (q) => (q.state.data?.some(working) ? 3000 : false),
  });
}

export function useCreateGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerationBody) => api.post<GenerationDto>('/studio/generations', body),
    onSuccess: (g) => {
      qc.setQueryData<GenerationDto[]>(qk.studio.generations, (old) => [g, ...(old ?? [])]);
      void qc.invalidateQueries({ queryKey: qk.studio.limits });
      void qc.invalidateQueries({ queryKey: qk.studio.summary });
    },
  });
}

const replace = (qc: ReturnType<typeof useQueryClient>, g: GenerationDto) =>
  qc.setQueryData<GenerationDto[]>(qk.studio.generations, (old) => old?.map((x) => (x.id === g.id ? g : x)));

export function useFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId, favourite }: { imageId: string; favourite: boolean }) =>
      api.patch<GenerationDto>(`/studio/images/${imageId}`, { favourite }),
    onSuccess: (g) => replace(qc, g),
  });
}

export function useDesignFromImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId, body }: { imageId: string; body: z.input<typeof designFromImageBody> }) =>
      api.post<AdminDesignDetail>(`/studio/images/${imageId}/design`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.studio.all });
      void qc.invalidateQueries({ queryKey: ['designs'] });
    },
  });
}

export function usePinPreview() {
  return useMutation({ mutationFn: (url: string) => api.post<PinPreviewDto>('/studio/pinterest/preview', { url }) });
}

export function useSavePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; note?: string }) => api.post<ReferenceDto>('/studio/pinterest/save', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['references'] });
      void qc.invalidateQueries({ queryKey: qk.studio.summary });
    },
  });
}

export function usePinterestBoards() {
  return useQuery({
    queryKey: qk.studio.boards,
    queryFn: () => api.get<{ connected: boolean; boards: PinterestBoardDto[] }>('/studio/pinterest/boards'),
    staleTime: 5 * 60_000,
  });
}

export function useBoardPins(boardId: string | null) {
  return useQuery({
    queryKey: qk.studio.boardPins(boardId ?? ''),
    queryFn: () => api.get<PinterestPinDto[]>(`/studio/pinterest/boards/${boardId}/pins`),
    enabled: Boolean(boardId),
    staleTime: 5 * 60_000,
  });
}
