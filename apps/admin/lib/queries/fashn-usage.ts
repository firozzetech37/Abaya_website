'use client';

import type { FashnUsageJobsDto, FashnUsageReportDto, FashnUsageSummaryDto } from '@abaya/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api-client';
import { qk } from './keys';

type Range = { from: string; to: string };

/** Everyone who used FASHN in the range (India days, both ends included). */
export function useFashnUsage(range: Range, enabled = true) {
  return useQuery({
    queryKey: qk.fashnUsage.report(range),
    queryFn: ({ signal }) => api.get<FashnUsageReportDto>('/admin/fashn-usage', range, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useFashnUsageSummary() {
  return useQuery({
    queryKey: qk.fashnUsage.summary,
    queryFn: ({ signal }) => api.get<FashnUsageSummaryDto>('/admin/fashn-usage/summary', undefined, signal),
    refetchInterval: 60_000,
  });
}

export function useFashnUsageJobs(userId: string | null, range: Range) {
  return useQuery({
    queryKey: qk.fashnUsage.jobs(userId ?? '', range),
    queryFn: ({ signal }) => api.get<FashnUsageJobsDto>(`/admin/fashn-usage/users/${userId}/jobs`, range, signal),
    enabled: Boolean(userId),
  });
}
