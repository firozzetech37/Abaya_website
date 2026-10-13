'use client';

import { type OrderStatus, type ProductionStage } from '@abaya/contracts';
import { Badge } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';

/** One chip per order: payment state until paid, then the least-advanced item's stage. */
export function OrderStatusChip({ status, stage }: { status: OrderStatus; stage: ProductionStage | null }) {
  const { orderStatusLabels, stageLabels } = useStrings();
  if (status === 'PENDING_PAYMENT') return <Badge tone="warning">{orderStatusLabels.PENDING_PAYMENT}</Badge>;
  if (status === 'CANCELLED' || status === 'REFUNDED') return <Badge tone="danger">{orderStatusLabels[status]}</Badge>;
  if (status === 'COMPLETED' || stage === 'DELIVERED') return <Badge tone="success">{stage ? stageLabels[stage] : orderStatusLabels.COMPLETED}</Badge>;
  if (!stage) return <Badge tone="accent">{orderStatusLabels[status]}</Badge>;
  return <Badge tone={stage === 'SHIPPED' ? 'info' : 'accent'}>{stageLabels[stage]}</Badge>;
}
