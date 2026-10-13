'use client';

import type { OrderingStatusDto, OrderingWaitlistDto } from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { useAuth } from '../auth';

const statusKey = ['ordering', 'status'] as const;
const waitlistKey = ['me', 'ordering-waitlist'] as const;

/** Whether the bag, checkout and HD downloads are open ("Ordering coming soon" when not). */
export function useOrderingStatus() {
  return useQuery({ queryKey: statusKey, queryFn: () => api<OrderingStatusDto>('/ordering/status'), staleTime: 5 * 60_000 });
}

/** true / false once known; null while loading (nothing ordering-related is shown until then). */
export function useOrderingOpen(): boolean | null {
  const status = useOrderingStatus();
  return status.data ? status.data.orderingEnabled : null;
}

export function useOrderingWaitlist() {
  const enabled = useAuth().status === 'authenticated';
  return useQuery({ queryKey: waitlistKey, queryFn: () => api<OrderingWaitlistDto>('/me/ordering-waitlist'), enabled });
}

export function useJoinOrderingWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<OrderingWaitlistDto>('/me/ordering-waitlist', { method: 'POST' }),
    onSuccess: (dto) => qc.setQueryData(waitlistKey, dto),
  });
}
