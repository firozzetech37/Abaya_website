'use client';

import type {
  AdminOptionGroupDto,
  AdminOptionValueDto,
  AdminSizeBandDto,
  AdminCollectionDto,
} from '@abaya/contracts';
import {
  type collectionBody,
  type updateCollectionBody,
  type updateOptionValueBody,
  type updateSizeBandBody,
  type upsertOptionValueBody,
} from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '../api-client';
import { qk } from './keys';

export function useOptionGroups() {
  return useQuery({ queryKey: qk.options, queryFn: () => api.get<AdminOptionGroupDto[]>('/admin/options'), staleTime: 5 * 60_000 });
}

export function useSizeBands() {
  return useQuery({ queryKey: qk.sizeBands, queryFn: () => api.get<AdminSizeBandDto[]>('/admin/size-bands'), staleTime: 5 * 60_000 });
}

export function useCreateOptionValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof upsertOptionValueBody>) => api.post<AdminOptionValueDto>('/admin/options/values', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.options }),
  });
}

export function useUpdateOptionValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: z.input<typeof updateOptionValueBody> }) =>
      api.patch<AdminOptionValueDto>(`/admin/options/values/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.options }),
  });
}

export function useUpdateSizeBand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: z.input<typeof updateSizeBandBody> }) =>
      api.patch<AdminSizeBandDto>(`/admin/size-bands/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.sizeBands }),
  });
}

export function useCollections() {
  return useQuery({ queryKey: qk.collections, queryFn: () => api.get<AdminCollectionDto[]>('/admin/collections') });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof collectionBody>) => api.post<AdminCollectionDto>('/admin/collections', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.collections }),
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: z.input<typeof updateCollectionBody> }) =>
      api.patch<AdminCollectionDto>(`/admin/collections/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.collections }),
  });
}
