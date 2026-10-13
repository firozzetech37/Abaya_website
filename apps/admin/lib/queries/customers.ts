'use client';

import type { AdminCustomerDto, CustomerAnalyticsDto, CustomerAudience, Paginated } from '@abaya/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client';
import { qk } from './keys';

/** GET /v1/admin/customers: accounts with order totals, newest first (customers by default). */
export function useCustomersPage(
  params: { q?: string; audience?: CustomerAudience; cursor?: string; limit?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: qk.customers(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<AdminCustomerDto>>(
        '/admin/customers',
        { q: params.q, audience: params.audience ?? 'customers', cursor: params.cursor, limit: params.limit ?? 25 },
        signal,
      ),
    enabled,
    placeholderData: (prev) => prev,
  });
}

/** GET /v1/admin/customers/analytics: accounts, buyers, revenue and top customers. */
export function useCustomerAnalytics(audience: CustomerAudience) {
  return useQuery({
    queryKey: ['customers', 'analytics', audience],
    queryFn: ({ signal }) => api.get<CustomerAnalyticsDto>('/admin/customers/analytics', { audience }, signal),
    placeholderData: (prev) => prev,
  });
}
