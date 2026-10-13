import type { CheckoutResponse, OrderDetailDto, OrderSummaryDto, Paginated } from '@abaya/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { useAuth } from '../auth';
import { meKeys } from './account';

/** POST /v1/checkout response (shared type from @abaya/contracts). */
export type CheckoutResult = CheckoutResponse;

export function useOrders() {
  const { session } = useAuth();
  return useInfiniteQuery({
    queryKey: meKeys.orders,
    enabled: Boolean(session),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<OrderSummaryDto>>('/orders', { signal, query: { limit: 20, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useOrder(orderNumber: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: meKeys.order(orderNumber ?? ''),
    enabled: Boolean(session && orderNumber),
    queryFn: ({ signal }) => api<OrderDetailDto>(`/orders/${encodeURIComponent(orderNumber ?? '')}`, { signal }),
  });
}

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
      void qc.invalidateQueries({ queryKey: meKeys.cart });
      void qc.invalidateQueries({ queryKey: meKeys.orders });
    },
  });
}

export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
      api<{ orderId: string; status: 'CAPTURED' }>('/payments/verify', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meKeys.cart });
      void qc.invalidateQueries({ queryKey: meKeys.orders });
    },
  });
}
