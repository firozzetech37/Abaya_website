'use client';

import type { z } from 'zod';
import type {
  CreateCustomerPreviewBody,
  createTryOnBody,
  CustomerAiLimitsDto,
  CustomerPreviewDto,
  MyAiPicturesDto,
  RecentAiPicturesDto,
  UploadUrlResponse,
} from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api-client';
import { useAuth } from '../auth';
import { qk } from './keys';

/** What the server takes (a HEIC photo is turned into a JPEG in the browser first, lib/heic.ts). */
export const TRYON_ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function useAiLimits() {
  const enabled = useAuth().status === 'authenticated';
  return useQuery({ queryKey: qk.aiLimits, queryFn: () => api<CustomerAiLimitsDto>('/me/try-on/limits'), enabled });
}

/** One AI picture, checked every 3 seconds until it is ready or failed. */
export function useAiPicture(id: string | null) {
  return useQuery({
    queryKey: qk.aiPicture(id ?? ''),
    queryFn: () => api<CustomerPreviewDto>(`/me/try-on/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'DONE' || q.state.data.status === 'FAILED') ? false : 3_000),
  });
}

/**
 * Her recent previews and try-ons of one design (each kept for an hour). Checked every 5 seconds
 * while one is being made, else every 30 seconds so a picture past its hour drops off.
 */
export function useRecentAiPictures(designId: string) {
  const enabled = useAuth().status === 'authenticated';
  return useQuery({
    queryKey: qk.aiRecent(designId),
    queryFn: () => api<RecentAiPicturesDto>(`/me/try-on/recent?designId=${encodeURIComponent(designId)}`),
    enabled,
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.status === 'QUEUED' || i.status === 'RUNNING') ? 5_000 : 30_000),
  });
}

const RECENT_PREFIX = ['me', 'try-on', 'recent'] as const;
const MINE_KEY = ['me', 'try-on', 'mine'] as const;

/**
 * Every AI picture she can still see, from every abaya (profile, "My AI pictures"). Checked
 * every 5 seconds while one is being made, else every minute (the countdowns run in the page).
 */
export function useMyAiPictures() {
  const enabled = useAuth().status === 'authenticated';
  return useQuery({
    queryKey: MINE_KEY,
    queryFn: () => api<MyAiPicturesDto>('/me/try-on/mine'),
    enabled,
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.status === 'QUEUED' || i.status === 'RUNNING') ? 5_000 : 60_000),
  });
}

export function useCreatePreview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomerPreviewBody) => api<CustomerPreviewDto>('/me/try-on/previews', { method: 'POST', body }),
    onSuccess: (dto) => {
      qc.setQueryData(qk.aiPicture(dto.id), dto);
      void qc.invalidateQueries({ queryKey: qk.aiLimits });
      void qc.invalidateQueries({ queryKey: RECENT_PREFIX });
      void qc.invalidateQueries({ queryKey: MINE_KEY });
    },
  });
}

/** Her photo goes straight to private storage through a short-lived signed link. */
export async function uploadTryOnPhoto(file: File): Promise<string> {
  const type = file.type as 'image/jpeg' | 'image/png' | 'image/webp';
  if (!TRYON_ACCEPT.split(',').includes(type)) throw new ApiError(400, 'UNSUPPORTED_FILE', 'Please choose a JPEG, PNG, WebP or HEIC photo.');
  if (file.size > MAX_PHOTO_BYTES) throw new ApiError(400, 'FILE_TOO_LARGE', 'Please choose a photo smaller than 10 MB.');
  const signed = await api<UploadUrlResponse>('/me/try-on/uploads', { method: 'POST', body: { contentType: type } });
  let res: Response;
  try {
    res = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
  } catch {
    throw new ApiError(0, 'UPLOAD_FAILED', 'Could not upload your photo. Check your connection and try again.');
  }
  if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED', 'Could not upload your photo. Please try again.');
  return signed.storagePath;
}

export function useCreateTryOn() {
  const qc = useQueryClient();
  return useMutation({
    // A photo try-on uploads her photo first; "a model like me" sends only her measurements.
    mutationFn: async ({ file, ...rest }: Omit<z.input<typeof createTryOnBody>, 'personPath'> & { file?: File | null }) => {
      const personPath = file ? await uploadTryOnPhoto(file) : undefined;
      return api<CustomerPreviewDto>('/me/try-on/try-ons', { method: 'POST', body: { ...rest, ...(personPath ? { personPath } : {}) } });
    },
    onSuccess: (dto) => {
      qc.setQueryData(qk.aiPicture(dto.id), dto);
      void qc.invalidateQueries({ queryKey: qk.aiLimits });
      void qc.invalidateQueries({ queryKey: RECENT_PREFIX });
      void qc.invalidateQueries({ queryKey: MINE_KEY });
    },
  });
}

export function useDeleteTryOn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/me/try-on/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: qk.aiPicture(id) });
      void qc.invalidateQueries({ queryKey: RECENT_PREFIX });
      void qc.invalidateQueries({ queryKey: MINE_KEY });
    },
  });
}
