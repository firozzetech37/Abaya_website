'use client';

import type { DashboardDto, MeResponse } from '@abaya/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client';
import { qk } from './keys';

export function useMe(enabled: boolean) {
  return useQuery({ queryKey: qk.me, queryFn: () => api.get<MeResponse>('/me'), enabled, staleTime: 5 * 60_000 });
}

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api.get<DashboardDto>('/admin/dashboard'),
    refetchInterval: 60_000,
  });
}
