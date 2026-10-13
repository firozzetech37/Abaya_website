import {
  type AddressBody,
  type AddressDto,
  type ConsentPurpose,
  type MeasurementBody,
  type MeasurementProfileDto,
  type MeResponse,
  POLICY_VERSION,
  type RecordConsentsBody,
  updateProfileBody,
  type WishlistItemDto,
} from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '../api-client';
import { useAuth } from '../auth';

export const meKeys = {
  me: ['me'] as const,
  addresses: ['me', 'addresses'] as const,
  measurements: ['me', 'measurements'] as const,
  wishlist: ['me', 'wishlist'] as const,
  cart: ['me', 'cart'] as const,
  orders: ['me', 'orders'] as const,
  order: (n: string) => ['me', 'order', n] as const,
};

function useSignedIn() {
  const { session } = useAuth();
  return Boolean(session);
}

export function useMe() {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: meKeys.me,
    enabled: signedIn,
    queryFn: ({ signal }) => api<MeResponse>('/me', { signal }),
  });
}

export function hasCurrentConsent(me: MeResponse): boolean {
  const ok = (p: ConsentPurpose) =>
    me.consents.some((c) => c.purpose === p && c.granted && c.version === POLICY_VERSION);
  return ok('TERMS') && ok('PRIVACY');
}

export function useRecordConsents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (marketing: boolean) =>
      api<MeResponse>('/me/consents', {
        method: 'POST',
        body: {
          version: POLICY_VERSION,
          consents: [
            { purpose: 'TERMS', granted: true },
            { purpose: 'PRIVACY', granted: true },
            { purpose: 'MARKETING', granted: marketing },
          ],
        },
      }),
    onSuccess: (me) => qc.setQueryData(meKeys.me, me),
  });
}

/** Latest WhatsApp order-updates consent (any policy version). */
export function whatsappEnabled(me: MeResponse): boolean {
  return me.consents.some((c) => c.purpose === 'WHATSAPP_UPDATES' && c.granted);
}

/**
 * Turn WhatsApp order updates on/off. Turning on with a new phone saves the phone first
 * (PATCH /v1/me), because the API only sends to a valid Indian mobile on the profile.
 */
export function useSetWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ granted, phone }: { granted: boolean; phone?: string }) => {
      if (granted && phone) {
        const body: z.infer<typeof updateProfileBody> = updateProfileBody.parse({ phone });
        await api<MeResponse>('/me', { method: 'PATCH', body });
      }
      const consents: RecordConsentsBody = {
        version: POLICY_VERSION,
        consents: [{ purpose: 'WHATSAPP_UPDATES', granted }],
      };
      return api<MeResponse>('/me/consents', { method: 'POST', body: consents });
    },
    onSuccess: (me) => qc.setQueryData(meKeys.me, me),
  });
}

// ───────── Addresses ─────────

export function useAddresses() {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: meKeys.addresses,
    enabled: signedIn,
    queryFn: ({ signal }) => api<AddressDto[]>('/me/addresses', { signal }),
  });
}

export function useCreateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddressBody) => api<AddressDto>('/me/addresses', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKeys.addresses }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/me/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKeys.addresses }),
  });
}

// ───────── Measurements ─────────

export function useMeasurements(enabled = true) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: meKeys.measurements,
    enabled: signedIn && enabled,
    queryFn: ({ signal }) => api<MeasurementProfileDto[]>('/me/measurements', { signal }),
  });
}

export function useCreateMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MeasurementBody) =>
      api<MeasurementProfileDto>('/me/measurements', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKeys.measurements }),
  });
}

export function useDeleteMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/me/measurements/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKeys.measurements }),
  });
}

// ───────── Wishlist ─────────

export function useWishlist() {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: meKeys.wishlist,
    enabled: signedIn,
    queryFn: ({ signal }) => api<WishlistItemDto[]>('/me/wishlist', { signal }),
  });
}

export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ designId, saved }: { designId: string; saved: boolean }) => {
      if (saved) await api<void>(`/me/wishlist/${designId}`, { method: 'DELETE' });
      else await api<WishlistItemDto[]>(`/me/wishlist/${designId}`, { method: 'POST' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: meKeys.wishlist }),
  });
}

// ───────── Privacy ─────────

export function useDataExport() {
  return useMutation({
    mutationFn: () => api<unknown>('/me/data-export', { method: 'POST' }),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api<void>('/me', { method: 'DELETE', body: { confirm: 'DELETE' } }),
  });
}
