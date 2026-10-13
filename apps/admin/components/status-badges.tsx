import type {
  DesignStatus,
  OrderStatus,
  PaymentStatus,
  ProductionStage,
  ReferenceStatus,
  RefundStatus,
} from '@abaya/contracts';
import { isPaymentNotCompleted } from '@abaya/contracts';
import {
  DESIGN_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  REFERENCE_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  STAGE_LABELS,
  strings,
} from '@/content/strings';
import { Badge, type BadgeTone } from './ui/badge';

/** One colour per status, used everywhere (lists, editor, board, timeline). */
export const DESIGN_STATUS_TONE: Record<DesignStatus, BadgeTone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'info',
  CHANGES_REQUESTED: 'warning',
  PRICED: 'violet',
  PUBLISHED: 'success',
  ARCHIVED: 'dark',
};

export const STAGE_TONE: Record<ProductionStage, BadgeTone> = {
  PLACED: 'neutral',
  SPEC_APPROVED: 'info',
  PATTERN: 'indigo',
  CUTTING: 'violet',
  STITCHING: 'accent',
  QC: 'warning',
  FINISHING: 'info',
  PACKED: 'indigo',
  SHIPPED: 'orange',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  REMAKE: 'danger',
  ON_HOLD: 'warning',
  ASSIGNED: 'neutral',
};

/** Solid dot colour per stage for board column headers. */
export const STAGE_DOT: Record<ProductionStage, string> = {
  PLACED: 'bg-neutral-400',
  SPEC_APPROVED: 'bg-sky-500',
  PATTERN: 'bg-indigo-500',
  CUTTING: 'bg-violet-500',
  STITCHING: 'bg-accent-500',
  QC: 'bg-amber-500',
  FINISHING: 'bg-sky-600',
  PACKED: 'bg-indigo-600',
  SHIPPED: 'bg-orange-500',
  DELIVERED: 'bg-emerald-600',
  CANCELLED: 'bg-red-600',
  REMAKE: 'bg-red-400',
  ON_HOLD: 'bg-amber-600',
  ASSIGNED: 'bg-neutral-300',
};

const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'danger',
};

const REFERENCE_STATUS_TONE: Record<ReferenceStatus, BadgeTone> = {
  IMPORTED: 'neutral',
  IN_REVIEW: 'info',
  NEEDS_DESIGN: 'warning',
  DESIGNED: 'success',
  REJECTED: 'dark',
};

const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  CREATED: 'neutral',
  AUTHORIZED: 'info',
  CAPTURED: 'success',
  FAILED: 'danger',
  REFUNDED: 'dark',
  PARTIALLY_REFUNDED: 'warning',
};

const REFUND_STATUS_TONE: Record<RefundStatus, BadgeTone> = { PENDING: 'warning', PROCESSED: 'success', FAILED: 'danger' };

export const DesignStatusBadge = ({ status }: { status: DesignStatus }) => (
  <Badge tone={DESIGN_STATUS_TONE[status]} dot>
    {DESIGN_STATUS_LABELS[status]}
  </Badge>
);

export const StageBadge = ({ stage }: { stage: ProductionStage }) => (
  <Badge tone={STAGE_TONE[stage]} dot>
    {STAGE_LABELS[stage]}
  </Badge>
);

/** Order status; a checkout that was never paid shows as "Payment not completed" (grey). */
export const OrderStatusBadge = ({ status, placedAt }: { status: OrderStatus; placedAt?: string | null }) =>
  placedAt !== undefined && isPaymentNotCompleted({ status, placedAt }) ? (
    <Badge tone="neutral">{strings.orders.paymentNotCompleted}</Badge>
  ) : (
    <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
  );

export const ReferenceStatusBadge = ({ status }: { status: ReferenceStatus }) => (
  <Badge tone={REFERENCE_STATUS_TONE[status]} dot>
    {REFERENCE_STATUS_LABELS[status]}
  </Badge>
);

export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge tone={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>
);

export const RefundStatusBadge = ({ status }: { status: RefundStatus }) => (
  <Badge tone={REFUND_STATUS_TONE[status]}>{REFUND_STATUS_LABELS[status]}</Badge>
);
