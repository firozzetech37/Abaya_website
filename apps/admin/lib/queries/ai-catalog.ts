'use client';

import type {
  AbayaStyle,
  AddCatalogSetResponse,
  AdminDesignDetail,
  CatalogJobDto,
  CatalogLimitsDto,
  CatalogModelProfileDto,
  CatalogPromptPresetDto,
  DescribeReferenceResponse,
  Paginated,
  DesignReferenceType,
  CreateAiModelBody,
  CreateMasterBody,
  CreateOneStepBody,
  ReviewCatalogImageBody,
  createEditBody,
  createPersonalModelBody,
  createPosesBody,
  createReframeBody,
  designPhotoshootBody,
} from '@abaya/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type { z } from 'zod';
import { api } from '../api-client';
import { qk } from './keys';

/** AI Catalog (/v1/studio/catalog): FASHN jobs, model profiles and feedback. */
export function useCatalogLimits() {
  return useQuery({ queryKey: qk.aiCatalog.limits, queryFn: () => api.get<CatalogLimitsDto>('/studio/catalog/limits'), staleTime: 30_000 });
}

export function useCatalogModels() {
  return useQuery({ queryKey: qk.aiCatalog.models, queryFn: () => api.get<CatalogModelProfileDto[]>('/studio/catalog/models') });
}

/**
 * Generations, newest first: history loads 20 at a time (no polling); only the jobs still
 * being made are polled every 3 s. When one finishes, the history is refreshed once.
 */
export function useCatalogJobs() {
  const qc = useQueryClient();
  const history = useInfiniteQuery({
    queryKey: qk.aiCatalog.jobs,
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<CatalogJobDto>>('/studio/catalog/jobs', { cursor: pageParam, limit: 20 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const active = useQuery({
    queryKey: qk.aiCatalog.active,
    queryFn: ({ signal }) => api.get<CatalogJobDto[]>('/studio/catalog/jobs/active', undefined, signal),
    refetchInterval: (q) => (q.state.data?.length ? 3000 : false),
  });

  // A job that was running and is no longer: fetch the history once for its final state.
  const previous = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const now = new Set((active.data ?? []).map((j) => j.id));
    const finished = [...previous.current].some((id) => !now.has(id));
    previous.current = now;
    if (finished) void qc.invalidateQueries({ queryKey: qk.aiCatalog.jobs });
  }, [active.data, qc]);

  const data = React.useMemo(() => {
    if (!history.data) return undefined;
    const running = new Map((active.data ?? []).map((j) => [j.id, j]));
    const listed = history.data.pages.flatMap((p) => p.items).map((j) => running.get(j.id) ?? j);
    const listedIds = new Set(listed.map((j) => j.id));
    // Jobs started since the history was loaded come first.
    return [...(active.data ?? []).filter((j) => !listedIds.has(j.id)), ...listed];
  }, [history.data, active.data]);

  return {
    data,
    isPending: history.isPending,
    isError: history.isError,
    error: history.error,
    refetch: () => Promise.all([history.refetch(), active.refetch()]),
    hasNextPage: history.hasNextPage,
    fetchNextPage: () => history.fetchNextPage(),
    isFetchingNextPage: history.isFetchingNextPage,
  };
}

/** Any change: refresh jobs and today's credits. */
function useCatalogMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>, alsoModels = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.aiCatalog.jobs });
      void qc.invalidateQueries({ queryKey: qk.aiCatalog.active });
      void qc.invalidateQueries({ queryKey: qk.aiCatalog.limits });
      if (alsoModels) void qc.invalidateQueries({ queryKey: qk.aiCatalog.models });
    },
  });
}

export const useCreateAiModel = () =>
  useCatalogMutation((body: CreateAiModelBody) => api.post<CatalogJobDto>('/studio/catalog/models/ai', body));

export const useCreatePersonalModel = () =>
  useCatalogMutation(
    (body: z.input<typeof createPersonalModelBody>) => api.post<CatalogModelProfileDto>('/studio/catalog/models/personal', body),
    true,
  );

export const useSaveModel = () =>
  useCatalogMutation((body: { imageId: string; name?: string }) => api.post<CatalogModelProfileDto>('/studio/catalog/models/from-image', body), true);

export const useArchiveModel = () => useCatalogMutation((id: string) => api.delete<void>(`/studio/catalog/models/${id}`), true);

export const useCreateMaster = () => useCatalogMutation((body: CreateMasterBody) => api.post<CatalogJobDto>('/studio/catalog/masters', body));

export const useCreateOneStep = () =>
  useCatalogMutation((body: CreateOneStepBody) => api.post<CatalogJobDto>('/studio/catalog/masters/one-step', body));

export const useCreateCleanup = () =>
  useCatalogMutation((imagePath: string) => api.post<CatalogJobDto>('/studio/catalog/cleanups', { imagePath }));

export const useCreatePoses = () =>
  useCatalogMutation(({ imageId, body }: { imageId: string; body: z.input<typeof createPosesBody> }) =>
    api.post<CatalogJobDto[]>(`/studio/catalog/images/${imageId}/poses`, body),
  );

export const useCreateEdit = () =>
  useCatalogMutation(({ imageId, body }: { imageId: string; body: z.input<typeof createEditBody> }) =>
    api.post<CatalogJobDto>(`/studio/catalog/images/${imageId}/edits`, body),
  );

export const useCreateReframe = () =>
  useCatalogMutation(({ imageId, body }: { imageId: string; body: z.input<typeof createReframeBody> }) =>
    api.post<CatalogJobDto>(`/studio/catalog/images/${imageId}/reframe`, body),
  );

export const useReviewImage = () =>
  useCatalogMutation(({ imageId, body }: { imageId: string; body: ReviewCatalogImageBody }) =>
    api.patch<CatalogJobDto>(`/studio/catalog/images/${imageId}`, body),
  );

export const useRetryImage = () => useCatalogMutation((imageId: string) => api.post<CatalogJobDto>(`/studio/catalog/images/${imageId}/retry`, {}));

export const useMakeFinal = () => useCatalogMutation((imageId: string) => api.post<CatalogJobDto>(`/studio/catalog/images/${imageId}/final`, {}));

/** Catalog changes refresh the generations ("In catalog") and the designs list. */
function useCatalogToDesign<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.aiCatalog.jobs });
      void qc.invalidateQueries({ queryKey: ['designs'] });
    },
  });
}

export const useUseAsDesignPhoto = () =>
  useCatalogToDesign(
    ({
      imageId,
      designId,
      primary = false,
      colourValueId,
    }: {
      imageId: string;
      designId: string;
      primary?: boolean;
      colourValueId?: string;
    }) => api.post<AdminDesignDetail>(`/studio/catalog/images/${imageId}/design`, { designId, primary, colourValueId }),
  );

export const useCreateDesignFromImage = () =>
  useCatalogToDesign(({ imageId, body }: { imageId: string; body: { name: string; style: AbayaStyle; description?: string } }) =>
    api.post<AdminDesignDetail>(`/studio/catalog/images/${imageId}/new-design`, body),
  );

export const useAddSetToDesign = () =>
  useCatalogToDesign(
    ({
      designId,
      imageIds,
      primaryImageId,
      colourValueId,
    }: {
      designId: string;
      imageIds: string[];
      primaryImageId?: string;
      colourValueId?: string;
    }) =>
      api.post<AddCatalogSetResponse>(`/studio/catalog/designs/${designId}/images`, { imageIds, primaryImageId, colourValueId }),
  );

/** A few words for a reference photo's note (Gemini on the free key; null when unavailable). */
export function useDescribeReference() {
  return useMutation({
    mutationFn: (body: { type: DesignReferenceType; path: string }) =>
      api.post<DescribeReferenceResponse>('/studio/catalog/references/describe', body),
  });
}

export function usePromptPresets() {
  return useQuery({ queryKey: qk.aiCatalog.presets, queryFn: () => api.get<CatalogPromptPresetDto[]>('/studio/catalog/presets') });
}

export function useCreatePromptPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; text: string }) => api.post<CatalogPromptPresetDto>('/studio/catalog/presets', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.aiCatalog.presets }),
  });
}

export function useArchivePromptPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/studio/catalog/presets/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.aiCatalog.presets }),
  });
}

/** Usual FASHN time for a resolution and quality (docs: ~10 s fast 1K … ~55 s quality 4K). */
export function typicalSeconds(resolution: string, mode: string): number {
  const base = { fast: 10, balanced: 25, quality: 40 }[mode] ?? 25;
  return base + (resolution === '4k' ? 15 : resolution === '1k' ? -5 : 0);
}

// ───────────── From a design's Images tab ("Make with AI") ─────────────

/** The jobs started from this design, polled every few seconds while any is still running. */
export function useDesignCatalogJobs(designId: string) {
  return useQuery({
    queryKey: [...qk.aiCatalog.jobs, 'design', designId],
    queryFn: ({ signal }) => api.get<Paginated<CatalogJobDto>>('/studio/catalog/jobs', { designId, limit: 50 }, signal),
    select: (page) => page.items,
    refetchInterval: (q) => (q.state.data?.items.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING') ? 3000 : false),
  });
}

export const useCreateDesignPhotoshoot = () =>
  useCatalogMutation(({ designId, body }: { designId: string; body: z.input<typeof designPhotoshootBody> }) =>
    api.post<CatalogJobDto>(`/studio/catalog/designs/${designId}/photoshoot`, body),
  );

export const useCreateDesignEdit = () =>
  useCatalogMutation(({ designId, body }: { designId: string; body: z.input<typeof createEditBody> }) =>
    api.post<CatalogJobDto>(`/studio/catalog/designs/${designId}/edits`, body),
  );

export const useCreateDesignReframe = () =>
  useCatalogMutation(({ designId, body }: { designId: string; body: z.input<typeof createReframeBody> }) =>
    api.post<CatalogJobDto>(`/studio/catalog/designs/${designId}/reframe`, body),
  );
