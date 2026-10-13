'use client';

import type {
  CuttingBody,
  PatternBody,
  PatternStationDto,
  ProductionStage,
  StitchingBody,
  StitchingProblemType,
  TailorEarningsDto,
  WorkshopDoneItemDto,
  WorkshopItemDetail,
  WorkshopOverviewDto,
  WorkshopQueueItem,
  WorkshopStation,
  WorkshopStationSummary,
  WorkshopStepResult,
} from '@abaya/contracts';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { qk } from './keys';

export type QueueView = 'all' | 'mine' | 'overdue' | 'on-hold';

/** Queues change as other stations work: keep them fresh without reloading. */
const LIVE = { refetchInterval: 30_000, refetchOnWindowFocus: true } as const;

export function useWorkshopSummary(enabled = true) {
  return useQuery({
    queryKey: qk.workshop.summary,
    queryFn: () => api.get<WorkshopStationSummary[]>('/workshop/summary'),
    enabled,
    ...LIVE,
  });
}

export function useWorkshopQueue(station: WorkshopStation, view: QueueView) {
  return useQuery({
    queryKey: qk.workshop.queue(station, view),
    queryFn: () => api.get<WorkshopQueueItem[]>(`/workshop/stations/${station}/items`, { view }),
    placeholderData: (prev) => prev,
    ...LIVE,
  });
}

/** A station's finished work (last 30 days). */
export function useWorkshopDone(station: WorkshopStation, enabled = true) {
  return useQuery({
    queryKey: [...qk.workshop.all, 'done', station],
    queryFn: () => api.get<WorkshopDoneItemDto[]>(`/workshop/stations/${station}/done`),
    enabled,
  });
}

export function useWorkshopItem(id: string) {
  return useQuery({
    queryKey: qk.workshop.item(id),
    queryFn: () => api.get<WorkshopItemDetail>(`/workshop/items/${id}`),
    ...LIVE,
  });
}

/** Managers: who is working on what, who is idle, and what needs attention. */
export function useWorkshopOverview(enabled = true) {
  return useQuery({
    queryKey: [...qk.workshop.all, 'overview'],
    queryFn: () => api.get<WorkshopOverviewDto>('/workshop/overview'),
    enabled,
    ...LIVE,
  });
}

/** "My jobs" at every station this person works (the workshop home page). */
export function useMyWorkshopJobs(stations: WorkshopStation[]) {
  return useQueries({
    queries: stations.map((station) => ({
      queryKey: qk.workshop.queue(station, 'mine'),
      queryFn: () => api.get<WorkshopQueueItem[]>(`/workshop/stations/${station}/items`, { view: 'mine' }),
      ...LIVE,
    })),
    combine: (results) => ({
      items: results.flatMap((r) => r.data ?? []),
      isPending: results.some((r) => r.isPending),
      error: results.find((r) => r.isError)?.error ?? null,
      refetch: () => results.forEach((r) => void r.refetch()),
    }),
  });
}

/** Every workshop step refreshes the queues, counts and the job card. */
function useStep<TVars, TResult>(id: string, fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      const item = (result as WorkshopStepResult | WorkshopItemDetail | null) ?? null;
      const detail = item && 'item' in item ? item.item : item;
      if (detail && 'actions' in detail) qc.setQueryData(qk.workshop.item(id), detail);
      void qc.invalidateQueries({ queryKey: qk.workshop.all });
    },
  });
}

export const useClaimJob = (id: string) => useStep(id, () => api.post<WorkshopItemDetail>(`/workshop/items/${id}/claim`));
export const useReleaseJob = (id: string) => useStep(id, () => api.post<WorkshopItemDetail>(`/workshop/items/${id}/release`));
/** A question, or at stitching a problem with the kit (type + optional photo). */
export const useHoldJob = (id: string) =>
  useStep(id, (body: { reason: string; problemType?: StitchingProblemType; photoPath?: string }) =>
    api.post<WorkshopItemDetail>(`/workshop/items/${id}/hold`, body),
  );
/** Carry on; for a stitching problem the production manager may pick `to: 'CUTTING'` (re-cut). */
export const useResumeJob = (id: string) =>
  useStep(id, (body: { note?: string; to?: ProductionStage }) => api.post<WorkshopItemDetail>(`/workshop/items/${id}/resume`, body));
export const useCompleteStitching = (id: string) =>
  useStep(id, (body: StitchingBody) => api.post<WorkshopStepResult>(`/workshop/items/${id}/stitching`, body));
export const useCompleteCutting = (id: string) =>
  useStep(id, (body: CuttingBody) => api.post<WorkshopStepResult>(`/workshop/items/${id}/cutting`, body));
export const useAdvanceJob = (id: string) =>
  useStep(id, (body: { to: ProductionStage; note?: string; photoPath?: string }) =>
    api.post<WorkshopStepResult>(`/workshop/items/${id}/advance`, body),
  );

/** Refresh the station after a step done through another endpoint (QC form, shipping). */
export function useRefreshWorkshop() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: qk.workshop.all });
}

/** Pattern station: the pattern to edit (or read), with a prefill for a new version. */
export function usePattern(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.workshop.pattern(id),
    queryFn: () => api.get<PatternStationDto>(`/workshop/items/${id}/pattern`),
    enabled,
  });
}

export function useSavePattern(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatternBody) => api.put<PatternStationDto>(`/workshop/items/${id}/pattern`, body),
    onSuccess: (data) => qc.setQueryData(qk.workshop.pattern(id), data),
  });
}

/** A tailor's pay: pending, paid this month, paid in total. */
export function useTailorEarnings(enabled = true) {
  return useQuery({
    queryKey: qk.workshop.earnings,
    queryFn: () => api.get<TailorEarningsDto>('/workshop/earnings'),
    enabled,
  });
}
