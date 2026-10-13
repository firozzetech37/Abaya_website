'use client';

import type { MakerDto, MakerPayoutDto } from '@abaya/contracts';
import { type updateMakerBody } from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '../api-client';
import { qk } from './keys';

export type { MakerPayoutDto };

export function useMakers(enabled = true) {
  return useQuery({ queryKey: qk.makers, queryFn: () => api.get<MakerDto[]>('/admin/makers'), enabled });
}

export function useUpdateMaker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: z.input<typeof updateMakerBody> }) =>
      api.patch<MakerDto>(`/admin/makers/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.makers }),
  });
}

export function useMakerPayouts(makerId: string | null) {
  return useQuery({
    queryKey: qk.payouts(makerId ?? ''),
    queryFn: () => api.get<MakerPayoutDto[]>(`/admin/makers/${makerId}/payouts`),
    enabled: Boolean(makerId),
  });
}

export function useMarkPayoutPaid(makerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payoutId, reference }: { payoutId: string; reference: string }) =>
      api.post<MakerPayoutDto>(`/admin/makers/${makerId}/payouts/${payoutId}/paid`, { reference }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.makers });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

/** "Enable app login": links the tailor's phone-OTP account and grants MAKER (they must log in once first). */
