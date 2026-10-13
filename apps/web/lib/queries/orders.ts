'use client';

import type { checkoutResponse, OrderDetailDto, OrderSummaryDto, Paginated } from '@abaya/contracts';
import type { z } from 'zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { useAuth } from '../auth';
import { qk } from './keys';

export type CheckoutResult = z.infer<typeof checkoutResponse>;

export function useOrders() {
  const enabled = useAuth().status === 'authenticated';
  return useInfiniteQuery({
    queryKey: qk.orders,
    queryFn: ({ pageParam }) =>
      api<Paginated<OrderSummaryDto>>('/orders', { query: { limit: 20, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

export function useOrder(orderNumber: string) {
  const enabled = useAuth().status === 'authenticated';
  return useQuery({
    queryKey: qk.order(orderNumber),
    queryFn: () => api<OrderDetailDto>(`/orders/${encodeURIComponent(orderNumber)}`),
    enabled,
    // Stage photo URLs are signed for ~10 minutes; refresh before they expire.
    refetchInterval: 8 * 60_000,
  });
}

/** Creates the order and the Razorpay order. Prices are computed by the API only. */
export function useCheckout() {
  return useMutation({
    mutationFn: (body: { addressId: string; customerNote?: string }) =>
      api<CheckoutResult>('/checkout', { method: 'POST', body }),
  });
}

/** 'test' when the API runs with PAYMENT_PROVIDER=fake (development): checkout shows "Simulate payment". */
export function usePaymentConfig() {
  return useQuery({
    queryKey: ['payments', 'config'],
    queryFn: () => api<{ mode: 'razorpay' | 'test' }>('/payments/config'),
    staleTime: 60_000,
  });
}

/** Development test mode only (API PAYMENT_PROVIDER=fake): pay a pending order without Razorpay. */
export function useSimulatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderNumber: string) =>
      api<unknown>(`/orders/${encodeURIComponent(orderNumber)}/simulate-payment`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.cart });
      void qc.invalidateQueries({ queryKey: qk.orders });
    },
  });
}

export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
      api<{ orderId: string; status: 'CAPTURED' }>('/payments/verify', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.cart });
      void qc.invalidateQueries({ queryKey: qk.orders });
    },
  });
}
