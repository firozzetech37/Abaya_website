'use client';

import type {
  AdminOrderDetail,
  AdminOrderListItem,
  ItemTeamDto,
  OrderStatus,
  Paginated,
  PaymentDto,
  ProductionStage,
  TechPackContent,
  TechPackDto,
  TeamBody,
  TeamOptionsDto,
} from '@abaya/contracts';
import {
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../api-client';
import { qk } from './keys';

export interface OrderListParams {
  status?: OrderStatus;
  stage?: ProductionStage;
  q?: string;
  customerId?: string;
}

/** GET /v1/admin/order-items/:id/tech-pack → saved (if any) plus a draft from the order snapshot. */
export interface TechPackResponse {
  saved: TechPackDto | null;
  draft: TechPackContent;
}

export function useOrdersPage(
  params: OrderListParams & { cursor?: string; limit?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: qk.orders.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<AdminOrderListItem>>(
        '/admin/orders',
        {
          status: params.status,
          stage: params.stage,
          q: params.q,
          customerId: params.customerId,
          cursor: params.cursor,
          limit: params.limit ?? 25,
        },
        signal,
      ),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useOrdersBoard(params: OrderListParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.orders.board(params),
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<AdminOrderListItem>>(
        '/admin/orders',
        { status: params.status, stage: params.stage, q: params.q, cursor: pageParam, limit: 100 },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    refetchInterval: 60_000,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: qk.orders.detail(id),
    queryFn: () => api.get<AdminOrderDetail>(`/admin/orders/${id}`),
  });
}

export function useOrderPayments(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...qk.orders.detail(orderId), 'payments'],
    queryFn: () => api.get<PaymentDto[]>(`/admin/orders/${orderId}/payments`),
    enabled,
  });
}

export function useTechPack(itemId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.techPack(itemId ?? ''),
    queryFn: () => api.get<TechPackResponse>(`/admin/order-items/${itemId}/tech-pack`),
    enabled: Boolean(itemId) && enabled,
  });
}

/** The checklist is the same for every item today; cached once. */
export function useQcChecklist(itemId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.qcChecklist,
    queryFn: () => api.get<string[]>(`/admin/order-items/${itemId}/qc/checklist`),
    enabled,
    staleTime: Infinity,
  });
}

/** After any production change, refresh the order, lists, dashboard and history. */
function useOrderMutation<TVars, TResult>(
  orderId: string,
  fn: (vars: TVars) => Promise<TResult>,
  extraKeys: QueryKey[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of extraKeys) void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: qk.orders.detail(orderId) });
      void qc.invalidateQueries({ queryKey: ['orders', 'list'] });
      void qc.invalidateQueries({ queryKey: ['orders', 'board'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      void qc.invalidateQueries({ queryKey: qk.makers });
    },
  });
}

export const useSaveTechPack = (orderId: string, itemId: string) =>
  useOrderMutation(
    orderId,
    (body: { content: TechPackContent; approve: boolean }) =>
      api.put<TechPackDto>(`/admin/order-items/${itemId}/tech-pack`, body),
    [qk.techPack(itemId)],
  );

/** Assign team: one person per station (and the tailor with a due date) for one abaya. */
export const useSetTeam = (orderId: string) =>
  useOrderMutation(
    orderId,
    ({ itemId, body }: { itemId: string; body: TeamBody }) =>
      api.put<ItemTeamDto>(`/admin/order-items/${itemId}/team`, body),
    [qk.teamOptions],
  );

/** People per station for the Assign team pickers, with their open jobs. */
export function useTeamOptions(enabled = true) {
  return useQuery({
    queryKey: qk.teamOptions,
    queryFn: () => api.get<TeamOptionsDto>('/admin/team-options'),
    enabled,
  });
}

export const useMoveStage = (orderId: string, itemId: string) =>
  useOrderMutation(orderId, (body: { to: ProductionStage; note?: string; photoPath?: string }) =>
    api.post<unknown>(`/admin/order-items/${itemId}/stage`, body),
  );

export const useRecordQc = (orderId: string, itemId: string) =>
  useOrderMutation(
    orderId,
    (body: {
      result: 'PASS' | 'FAIL';
      checklist: { item: string; ok: boolean }[];
      notes?: string;
      photoPaths: string[];
      sendBackTo?: 'STITCHING' | 'CUTTING' | 'PATTERN';
    }) => api.post<unknown>(`/admin/order-items/${itemId}/qc`, body),
  );

export const useCancelItem = (orderId: string, itemId: string) =>
  useOrderMutation(orderId, (body: { reason: string; refund: boolean }) =>
    api.post<unknown>(`/admin/order-items/${itemId}/cancel`, body),
  );

export const useShipItems = (orderId: string) =>
  useOrderMutation(
    orderId,
    (body: {
      orderItemIds: string[];
      carrier: string;
      trackingNumber: string;
      trackingUrl?: string;
    }) => api.post<AdminOrderDetail>(`/admin/orders/${orderId}/ship`, body),
  );

export const useRefund = (orderId: string) =>
  useOrderMutation(orderId, (body: { amountInPaise: number; reason: string }) =>
    api.post<PaymentDto>(`/admin/orders/${orderId}/refunds`, body),
  );
