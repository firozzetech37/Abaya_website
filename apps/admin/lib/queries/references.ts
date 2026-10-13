'use client';

import type { Paginated, ReferenceDto, ReferenceStatus, Role } from '@abaya/contracts';
import { type createReferenceBody, type updateReferenceBody } from '@abaya/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '../api-client';
import { qk } from './keys';

/** GET /v1/admin/staff?role= (not in @abaya/contracts responses). */
export interface StaffDirectoryEntry {
  id: string;
  name: string | null;
  email: string | null;
}

export function useReferences(status: ReferenceStatus | undefined, enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.references.list({ status }),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<ReferenceDto>>('/admin/references', { status, cursor: pageParam, limit: 24 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export function useReference(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.references.detail(id ?? ''),
    queryFn: () => api.get<ReferenceDto>(`/admin/references/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createReferenceBody>) => api.post<ReferenceDto>('/admin/references', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.references.all }),
  });
}

export function useUpdateReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: z.input<typeof updateReferenceBody> }) =>
      api.patch<ReferenceDto>(`/admin/references/${id}`, body),
    onSuccess: (ref) => {
      qc.setQueryData(qk.references.detail(ref.id), ref);
      void qc.invalidateQueries({ queryKey: ['references', 'list'] });
    },
  });
}

export function useStaffDirectory(role: Role, enabled = true) {
  return useQuery({
    queryKey: qk.staffDirectory(role),
    queryFn: () => api.get<StaffDirectoryEntry[]>('/admin/staff', { role }),
    enabled,
    staleTime: 5 * 60_000,
  });
}
