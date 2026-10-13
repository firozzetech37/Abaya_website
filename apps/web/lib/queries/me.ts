'use client';

import {
  type AddressBody,
  type AddressDto,
  indianPhone,
  type MeasurementBody,
  type MeasurementProfileDto,
  type MeResponse,
  POLICY_VERSION,
  type RecordConsentsBody,
  updateProfileBody,
  type WishlistItemDto,
} from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { useAuth } from '../auth';
import { qk } from './keys';

function useAuthed(): boolean {
  return useAuth().status === 'authenticated';
}

export function useMe() {
  const enabled = useAuthed();
  return useQuery({ queryKey: qk.me, queryFn: () => api<MeResponse>('/me'), enabled, staleTime: 60_000 });
}

/** True when the user still has to accept the current terms + privacy notice. */
export function needsConsent(me: MeResponse | undefined): boolean {
  if (!me) return false;
  const ok = (purpose: 'TERMS' | 'PRIVACY') =>
    me.consents.some((c) => c.purpose === purpose && c.granted && c.version === POLICY_VERSION);
  return !(ok('TERMS') && ok('PRIVACY'));
}

export function useRecordConsents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordConsentsBody) => api<MeResponse>('/me/consents', { method: 'POST', body }),
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; phone?: string }) => api<MeResponse>('/me', { method: 'PATCH', body }),
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
}

/** Latest WhatsApp order-updates consent (any policy version). */
export function whatsappEnabled(me: MeResponse | undefined): boolean {
  return Boolean(me?.consents.some((c) => c.purpose === 'WHATSAPP_UPDATES' && c.granted));
}

/** Last 10 digits of a stored phone when it is a valid Indian mobile, else ''. */
export function localMobile(phone: string | null | undefined): string {
  if (!phone) return '';
  const local = phone.replace(/\D/g, '').slice(-10);
  return indianPhone.safeParse(local).success ? local : '';
}

/**
 * Turn WhatsApp order updates on/off. A new phone is saved first (PATCH /v1/me) because
 * the API only sends to a valid Indian mobile on the profile.
 */
export function useSetWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ granted, phone }: { granted: boolean; phone?: string }) => {
      if (granted && phone) {
        const body = updateProfileBody.parse({ phone });
        await api<MeResponse>('/me', { method: 'PATCH', body });
      }
      const body: RecordConsentsBody = {
        version: POLICY_VERSION,
        consents: [{ purpose: 'WHATSAPP_UPDATES', granted }],
      };
      return api<MeResponse>('/me/consents', { method: 'POST', body });
    },
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
}

// ───── Addresses ─────

export function useAddresses() {
  const enabled = useAuthed();
  return useQuery({ queryKey: qk.addresses, queryFn: () => api<AddressDto[]>('/me/addresses'), enabled });
}

export function useSaveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: AddressBody }) =>
      id
        ? api<AddressDto>(`/me/addresses/${id}`, { method: 'PATCH', body })
        : api<AddressDto>('/me/addresses', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.addresses }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/me/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.addresses }),
  });
}

// ───── Measurements ─────

export function useMeasurements() {
  const enabled = useAuthed();
  return useQuery({
    queryKey: qk.measurements,
    queryFn: () => api<MeasurementProfileDto[]>('/me/measurements'),
    enabled,
  });
}

export function useMeasurement(id: string) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: qk.measurement(id),
    queryFn: () => api<MeasurementProfileDto>(`/me/measurements/${id}`),
    enabled: enabled && Boolean(id),
  });
}

export function useSaveMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: MeasurementBody }) =>
      id
        ? api<MeasurementProfileDto>(`/me/measurements/${id}`, { method: 'PATCH', body })
        : api<MeasurementProfileDto>('/me/measurements', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.measurements }),
  });
}

export function useDeleteMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/me/measurements/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.measurements }),
  });
}

// ───── Wishlist ─────

export function useWishlist() {
  const enabled = useAuthed();
  return useQuery({ queryKey: qk.wishlist, queryFn: () => api<WishlistItemDto[]>('/me/wishlist'), enabled });
}

export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ designId, saved }: { designId: string; saved: boolean }) => {
      if (saved) {
        await api<void>(`/me/wishlist/${designId}`, { method: 'DELETE' });
        return (qc.getQueryData<WishlistItemDto[]>(qk.wishlist) ?? []).filter((w) => w.designId !== designId);
      }
      return api<WishlistItemDto[]>(`/me/wishlist/${designId}`, { method: 'POST' });
    },
    onSuccess: (list) => qc.setQueryData(qk.wishlist, list),
  });
}

// ───── Privacy ─────

export function useDataExport() {
  return useMutation({ mutationFn: () => api<Record<string, unknown>>('/me/data-export', { method: 'POST' }) });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: () => api<void>('/me', { method: 'DELETE', body: { confirm: 'DELETE' } }) });
}
