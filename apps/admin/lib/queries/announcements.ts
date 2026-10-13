'use client';

import type { AdminAnnouncementDto, announcementBody, TranslationDto, updateAnnouncementBody } from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '../api-client';
import { qk } from './keys';

export function useAnnouncements() {
  return useQuery({ queryKey: qk.announcements, queryFn: () => api.get<AdminAnnouncementDto[]>('/admin/announcements') });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof announcementBody>) => api.post<AdminAnnouncementDto>('/admin/announcements', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.announcements }),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: z.input<typeof updateAnnouncementBody> }) => api.patch<AdminAnnouncementDto>(`/admin/announcements/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.announcements }),
  });
}

export function useTranslate() {
  return useMutation({ mutationFn: (text: string) => api.post<TranslationDto>('/admin/announcements/translate', { text }) });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/announcements/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.announcements }),
  });
}
