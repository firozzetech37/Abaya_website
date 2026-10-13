import type { ProductionStage } from '@abaya/contracts';

/**
 * Cross-module domain events (docs/apps/api.md). Emitters and listeners both
 * import from here, so no module has to reach into another module's folders.
 */
export const EVENTS = {
  DesignPublished: 'catalog.design_published',
  PaymentCaptured: 'payments.payment_captured',
  RefundProcessed: 'payments.refund_processed',
  OrderPaid: 'orders.order_paid',
  OrderStageChanged: 'orders.stage_changed',
  MakerAssigned: 'orders.maker_assigned',
  TailorAdded: 'identity.tailor_added',
} as const;

export interface DesignPublishedEvent {
  designId: string;
  slug: string;
}

export interface PaymentCapturedEvent {
  /** What was paid for: an abaya order or an HD download (one of the two is set). */
  orderId: string | null;
  downloadId: string | null;
  paymentId: string;
  providerPaymentId: string;
  amountInPaise: number;
}

export interface RefundProcessedEvent {
  orderId: string;
  refundId: string;
  amountInPaise: number;
  /** True when the order's captured amount has been refunded in full. */
  fullyRefunded: boolean;
}

export interface OrderPaidEvent {
  orderId: string;
  orderNumber: string;
  userId: string;
  totalInPaise: number;
}

export interface OrderStageChangedEvent {
  orderId: string;
  orderNumber: string;
  userId: string;
  orderItemId: string;
  designName: string;
  from: ProductionStage | null;
  to: ProductionStage;
  note?: string;
  /** Tailor the item is (now) assigned to, assigned tailor, if any. */
  makerId: string | null;
  dueDate: string | null;
}

/** A tailor was (re)assigned to an item; no stage change. */
export interface MakerAssignedEvent {
  orderItemId: string;
  designName: string;
  makerId: string;
  dueDate: string | null;
  stage: ProductionStage;
}

/** A tailor was added (or re-added) in Staff & roles; production keeps their tailor record. */
export interface TailorAddedEvent {
  email: string;
  name: string | null;
  city: string;
  actorUserId: string;
  ip?: string;
}

export interface EventMap {
  [EVENTS.DesignPublished]: DesignPublishedEvent;
  [EVENTS.PaymentCaptured]: PaymentCapturedEvent;
  [EVENTS.RefundProcessed]: RefundProcessedEvent;
  [EVENTS.OrderPaid]: OrderPaidEvent;
  [EVENTS.OrderStageChanged]: OrderStageChangedEvent;
  [EVENTS.MakerAssigned]: MakerAssignedEvent;
  [EVENTS.TailorAdded]: TailorAddedEvent;
}

/** Port for application code; implemented with @nestjs/event-emitter. */
export interface EventPublisher {
  publish<K extends keyof EventMap>(name: K, payload: EventMap[K]): Promise<void>;
}
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
