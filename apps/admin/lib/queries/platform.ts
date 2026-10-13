'use client';

import type { AdminUserDto, AuditLogDto, Paginated, Role, StaffInviteBody, StaffInviteDto, StaffInviteResult } from '@abaya/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { qk } from './keys';

export interface UserListParams {
  q?: string;
  role?: Role;
  cursor?: string;
}

export function useUsers(params: UserListParams) {
  return useQuery({
    queryKey: qk.users(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<AdminUserDto>>('/admin/users', { q: params.q, role: params.role, cursor: params.cursor, limit: 25 }, signal),
    placeholderData: (prev) => prev,
  });
}

export function useSetRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: Role[] }) => api.put<AdminUserDto>(`/admin/users/${id}/roles`, { roles }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

/** Staff added by email who have not signed in yet (and recent accepted/cancelled invites). */
export function useStaffInvites(enabled = true) {
  return useQuery({ queryKey: qk.staffInvites, queryFn: () => api.get<StaffInviteDto[]>('/admin/staff-invites'), enabled });
}

export function useInviteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StaffInviteBody) => api.post<StaffInviteResult>('/admin/staff-invites', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.staffInvites });
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: qk.makers }); // a new tailor appears under Tailors
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useCancelInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<StaffInviteDto>(`/admin/staff-invites/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.staffInvites }),
  });
}

export interface AuditParams {
  entityType?: string;
  entityId?: string;
  action?: string;
  actorUserId?: string;
}

export function useAuditLogs(params: AuditParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.audit(params),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<AuditLogDto>>('/admin/audit-logs', { ...params, cursor: pageParam, limit: 25 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}
