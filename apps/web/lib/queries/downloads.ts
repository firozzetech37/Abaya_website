'use client';

import type { CreateDownloadResponse, DownloadDto, DownloadLinkDto } from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { useAuth } from '../auth';
import { qk } from './keys';

/** HD design downloads the customer bought (paid only). */
export function useMyDownloads() {
  const enabled = useAuth().status === 'authenticated';
  return useQuery({ queryKey: qk.downloads, queryFn: () => api<DownloadDto[]>('/me/downloads'), enabled });
}

export function useStartDownload() {
  return useMutation({
    mutationFn: (designId: string) =>
      api<CreateDownloadResponse>('/me/downloads', { method: 'POST', body: { designId, licenceAccepted: true } }),
  });
}

/** Development test mode only (API PAYMENT_PROVIDER=fake). */
export function useSimulateDownloadPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<DownloadDto>(`/me/downloads/${id}/simulate-payment`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.downloads }),
  });
}

/** After Razorpay: the webhook or the verify call marks it paid; wait until it is. */
export async function waitUntilPaid(id: string, tries = 10): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const d = await api<DownloadDto>(`/me/downloads/${id}`);
    if (d.status === 'PAID') return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/** A fresh 10-minute link for one HD file, then let the browser save it. */
export async function downloadFile(id: string, index: number): Promise<void> {
  const link = await api<DownloadLinkDto>(`/me/downloads/${id}/files/${index}`, { method: 'POST' });
  const a = document.createElement('a');
  a.href = link.url;
  a.download = link.fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
