import type { CartDto, QuoteBody } from '@abaya/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api-client';
import { useAuth } from '../auth';
import { meKeys } from './account';

export function useCart() {
  const { session } = useAuth();
  return useQuery({
    queryKey: meKeys.cart,
    enabled: Boolean(session),
    queryFn: ({ signal }) => api<CartDto>('/cart', { signal }),
  });
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QuoteBody) => api<CartDto>('/cart/items', { method: 'POST', body }),
    onSuccess: (cart) => qc.setQueryData(meKeys.cart, cart),
  });
}

export function useUpdateCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api<CartDto>(`/cart/items/${id}`, { method: 'PATCH', body: { quantity } }),
    onSuccess: (cart) => qc.setQueryData(meKeys.cart, cart),
  });
}

export function useRemoveCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<CartDto>(`/cart/items/${id}`, { method: 'DELETE' }),
    onSuccess: (cart) => qc.setQueryData(meKeys.cart, cart),
  });
}
