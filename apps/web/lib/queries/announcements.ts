'use client';

import type { AnnouncementDto } from '@abaya/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '@/components/i18n/locale-provider';
import { api } from '../api-client';

/** The top bar's messages, in this page's language; empty when none is live (the bar then shows the built-in promises). */
export function useAnnouncements() {
  const locale = useLocale();
  return useQuery({
    queryKey: ['announcements', locale],
    queryFn: ({ signal }) => api<AnnouncementDto[]>('/announcements', { anonymous: true, signal, query: { lang: locale } }),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}
