import type {
  AddressSnapshot,
  ListAdminOrdersQuery,
  OrderStatus,
  PriceBreakdown,
  ProductionStage,
  SelectedOptionDto,
  SizeBandCode,
} from '@abaya/contracts';
import type { AuditEntry } from '../../../../common/audit/audit';

export interface DesignSnapshotJson {
  id: string;
  name: string;
  slug: string;
  style: string;
  primaryImagePath: string | null;
  leadTimeDays: number;
}

export interface StageEventRecord {
  id: string;
  fromStage: ProductionStage | null;
  toStage: ProductionStage;
  actorUserId: string | null;
  note: string | null;
  photoPath: string | null;
  createdAt: Date;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  designId: string;
  designSnapshot: DesignSnapshotJson;
  optionsSnapshot: SelectedOptionDto[];
  sizeBandCode: SizeBandCode;
  measurementsSnapshot: Record<string, number | string | null> | null;
  priceBreakdown: PriceBreakdown;
  unitPriceInPaise: number;
  quantity: number;
  stage: ProductionStage;
  makerId: string | null;
  dueDate: Date | null;
  /** Workshop: who has taken the job at its current station. */
  claimedById: string | null;
  claimedAt: Date | null;
  /** ON_HOLD: where it returns to, and why it stopped. */
  heldFromStage: ProductionStage | null;
  holdReason: string | null;
  /** Private copy of the customer's website AI preview (staff only); null when none or deleted. */
  aiPreviewPath: string | null;
  aiPreviewInspiration: boolean;
  stageEvents: StageEventRecord[];
}

export interface DoneStepRecord {
  orderItemId: string;
  toStage: ProductionStage;
  actorUserId: string | null;
  note: string | null;
  createdAt: Date;
}

export type ItemWithOrder = OrderItemRecord & { order: Omit<OrderRecord, 'items' | 'shipments'> };

/** Columns set together with a stage change. */
export interface StageSet {
  makerId?: string | null;
  dueDate?: Date | null;
  claimedById?: string | null;
  claimedAt?: Date | null;
  heldFromStage?: ProductionStage | null;
  holdReason?: string | null;
}

export interface ShipmentRecord {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: 'PENDING' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED';
  orderItemIds: string[];
  shippedAt: Date | null;
  deliveredAt: Date | null;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  subtotalInPaise: number;
  shippingInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  shippingAddress: AddressSnapshot;
  customerNote: string | null;
  placedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  items: OrderItemRecord[];
  shipments: ShipmentRecord[];
}

export interface NewOrderItem {
  designId: string;
  designSnapshot: DesignSnapshotJson;
  optionsSnapshot: SelectedOptionDto[];
  sizeBandCode: SizeBandCode;
  measurementsSnapshot: Record<string, number | string | null> | null;
  priceBreakdown: PriceBreakdown;
  unitPriceInPaise: number;
  aiPreviewPath?: string | null;
  aiPreviewInspiration?: boolean;
}

export interface StageChange {
  itemId: string;
  from: ProductionStage;
  to: ProductionStage;
  actorUserId: string | null;
  note?: string;
  photoPath?: string;
  /** Extra columns set together with the stage (claim, hold, maker assignment). */
  set?: StageSet;
  audit: AuditEntry;
}

export interface CustomerOrderSummary {
  /** Placed orders (paid at some point; failed or abandoned checkouts excluded). */
  orderCount: number;
  /** PAID + COMPLETED order totals. */
  totalSpentInPaise: number;
  /** PAID + COMPLETED orders. */
  paidOrderCount: number;
  lastOrderAt: Date | null;
}

export interface OrderRepository {
  /** AI preview copies of items delivered or cancelled before `before` (to delete). */
  listOldAiPreviews(before: Date, limit: number): Promise<{ itemId: string; path: string }[]>;
  clearAiPreviews(itemIds: string[]): Promise<void>;
  nextOrderSequence(): Promise<number>;
  createPending(input: {
    orderNumber: string;
    userId: string;
    subtotalInPaise: number;
    totalInPaise: number;
    shippingAddress: AddressSnapshot;
    customerNote?: string;
    items: NewOrderItem[];
  }): Promise<OrderRecord>;
  findById(id: string): Promise<OrderRecord | null>;
  findByNumber(orderNumber: string): Promise<OrderRecord | null>;
  listForUser(userId: string, cursor: string | undefined, limit: number): Promise<{ items: OrderRecord[]; nextCursor: string | null }>;
  listAdmin(query: ListAdminOrdersQuery, userIdsMatching?: string[]): Promise<{ items: OrderRecord[]; nextCursor: string | null }>;
  /** Items on paid orders at these stages (ON_HOLD items count where they were held), oldest first. */
  listForWorkshop(filter: { stages: ProductionStage[]; makerId?: string; limit: number }): Promise<ItemWithOrder[]>;
  /** Steps that moved items on from these stages (a station's finished work), newest first. */
  listDoneSteps(filter: { fromStages: ProductionStage[]; actorUserId?: string; since: Date; limit: number }): Promise<DoneStepRecord[]>;
  /**
   * Take (userId) or give back (null) the job at its current stage. Taking only works when
   * nobody else has it; giving back only when `onlyIfClaimedBy` holds it (null: anyone's).
   */
  setClaim(
    itemId: string,
    stage: ProductionStage,
    claimedById: string | null,
    onlyIfClaimedBy: string | null,
  ): Promise<boolean>;
  /** Tailor and due date, without a stage change (audited). */
  setAssignment(itemId: string, set: { makerId: string; dueDate: Date }, audit: AuditEntry): Promise<void>;
  /** Per-customer order totals for the admin Customers list. */
  /** Paid abayas of these designs and what they brought in (Studio). */
  salesOfDesigns(designIds: string[]): Promise<{ items: number; revenueInPaise: number }>;
  /** Checkouts still awaiting payment that were created before `olderThan`. */
  expireUnpaid(olderThan: Date, limit?: number): Promise<string[]>;
  /** Order totals per customer; without `userIds`, for everyone who has ordered. */
  customerSummaries(userIds?: string[]): Promise<Map<string, CustomerOrderSummary>>;
  findItem(itemId: string): Promise<(OrderItemRecord & { order: Omit<OrderRecord, 'items' | 'shipments'> }) | null>;
  /** Items assigned to a maker on paid orders, in the given stages; `updatedSince` limits history. */
  listItemsForMaker(
    makerId: string,
    stages: ProductionStage[],
    updatedSince?: Date,
  ): Promise<(OrderItemRecord & { order: Omit<OrderRecord, 'items' | 'shipments'> })[]>;
  findItemsByIds(ids: string[]): Promise<(OrderItemRecord & { order: Omit<OrderRecord, 'items' | 'shipments'> })[]>;
  /**
   * Moves one item from `from` to `to` (only if it is still at `from`), inserts the
   * OrderStageEvent and audit row in one transaction. Returns false on a lost race.
   */
  changeStage(change: StageChange): Promise<boolean>;
  /** PENDING_PAYMENT → PAID. Returns false if the order was not pending (idempotent). */
  markPaid(orderId: string, placedAt: Date): Promise<boolean>;
  setStatus(orderId: string, from: OrderStatus[], to: OrderStatus, audit: AuditEntry, extra?: { cancellationNote?: string }): Promise<boolean>;
  createShipment(input: {
    orderId: string;
    orderItemIds: string[];
    carrier: string;
    trackingNumber: string;
    trackingUrl?: string;
  }): Promise<ShipmentRecord>;
  markShipmentsDelivered(orderId: string, orderItemId: string): Promise<void>;
  countItemsByStage(): Promise<Partial<Record<ProductionStage, number>>>;
  /** Items being made per maker (ASSIGNED, CUTTING, STITCHING, QC, REMAKE). */
  countActiveByMaker(): Promise<Map<string, number>>;
  countItemsDue(before: Date, after?: Date): Promise<number>;
  paidTotalsSince(since: Date): Promise<{ orders: number; totalInPaise: number }>;
  exportForUser(userId: string): Promise<unknown[]>;
  anonymiseForUser(userId: string): Promise<void>;
  hasActiveOrders(userId: string): Promise<boolean>;
}
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

/** Signed URLs for stage photos (private bucket) and public design images. */
export interface OrderMedia {
  stagePhotoUrl(path: string): Promise<string>;
  designImageUrl(path: string | null): string | null;
}
export const ORDER_MEDIA = Symbol('ORDER_MEDIA');
