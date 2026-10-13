'use client';

import type { CartDto, QuoteBody } from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { useAuth } from '../auth';
import { qk } from './keys';

export function useCart() {
  const enabled = useAuth().status === 'authenticated';
  return useQuery({ queryKey: qk.cart, queryFn: () => api<CartDto>('/cart'), enabled });
}

/** Adds an item. The body is the same as a quote: never a price. */
export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QuoteBody) => api<CartDto>('/cart/items', { method: 'POST', body }),
    onSuccess: (cart) => qc.setQueryData(qk.cart, cart),
  });
}

export function useUpdateCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api<CartDto>(`/cart/items/${id}`, { method: 'PATCH', body: { quantity } }),
    onSuccess: (cart) => qc.setQueryData(qk.cart, cart),
  });
}

export function useRemoveCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<CartDto>(`/cart/items/${id}`, { method: 'DELETE' }),
    onSuccess: (cart) => qc.setQueryData(qk.cart, cart),
  });
}
