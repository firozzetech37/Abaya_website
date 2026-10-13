import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ListAdminOrdersQuery, ProductionStage } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import {
  EVENT_PUBLISHER,
  EVENTS,
  type EventPublisher,
  type PaymentCapturedEvent,
  type RefundProcessedEvent,
} from '../../../common/events/events';
import { CustomerService } from '../../customer/application/customer.service';
import { UploadsService } from '../../media/application/uploads.service';
import { PaymentsService } from '../../payments/application/payments.service';
import { assertStageChange, isCancellable, orderStatusWhenItemsFinish, type StageFlow } from '../domain/order.rules';
import { BusinessRuleError, ConflictRetryError, NotFoundError } from './orders.errors';
import {
  type DoneStepRecord,
  type ItemWithOrder,
  ORDER_REPOSITORY,
  type OrderRecord,
  type OrderRepository,
  type StageSet,
} from './ports/orders.ports';

export interface StageChangeOptions {
  flow: StageFlow;
  note?: string;
  photoPath?: string;
  set?: Pick<StageSet, 'makerId' | 'dueDate'>;
  /** The actor takes the job at the new stage straight away (e.g. starting a pattern). */
  claim?: boolean;
}

/**
 * Orders' exported application service. `changeStage` is the ONLY way an item's
 * production stage changes (docs/apps/api.md): rules, OrderStageEvent, AuditLog,
 * OrderStageChanged event and order completion all happen here.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    private readonly payments: PaymentsService,
    private readonly customer: CustomerService,
    private readonly uploads: UploadsService,
  ) {}

  async changeStage(itemId: string, to: ProductionStage, actor: Actor, opts: StageChangeOptions): Promise<ItemWithOrder> {
    const item = await this.requireItem(itemId);
    assertStageChange({
      from: item.stage,
      to,
      flow: opts.flow,
      actorRoles: actor.roles,
      orderStatus: item.order.status,
      heldFromStage: item.heldFromStage,
      photoPath: opts.photoPath,
      note: opts.note,
    });
    // A job is taken per stage: every move hands it back unless the actor keeps it.
    const set: StageSet = {
      ...opts.set,
      claimedById: opts.claim ? actor.userId : null,
      claimedAt: opts.claim ? new Date() : null,
      ...(to === 'ON_HOLD'
        ? { heldFromStage: item.stage, holdReason: opts.note?.trim() ?? null }
        : item.stage === 'ON_HOLD'
          ? { heldFromStage: null, holdReason: null }
          : {}),
    };
    if (opts.photoPath) {
      this.uploads.assertPath(opts.flow === 'qc' ? 'QC_PHOTO' : 'STAGE_PHOTO', opts.photoPath);
    }

    const changed = await this.orders.changeStage({
      itemId,
      from: item.stage,
      to,
      actorUserId: actor.userId,
      note: opts.note,
      photoPath: opts.photoPath,
      set,
      audit: {
        actorUserId: actor.userId,
        action: to === 'CANCELLED' ? 'order.cancelled' : 'order.stage_changed',
        entityType: 'OrderItem',
        entityId: itemId,
        before: { stage: item.stage },
        after: { stage: to, note: opts.note ?? null, ...(opts.set ?? {}) },
        ip: actor.ip,
      },
    });
    if (!changed) throw new ConflictRetryError();

    await this.events.publish(EVENTS.OrderStageChanged, {
      orderId: item.orderId,
      orderNumber: item.order.orderNumber,
      userId: item.order.userId,
      orderItemId: itemId,
      designName: item.designSnapshot.name,
      from: item.stage,
      to,
      note: opts.note,
      makerId: opts.set?.makerId ?? item.makerId,
      dueDate: (opts.set?.dueDate ?? item.dueDate)?.toISOString() ?? null,
    });
    await this.completeOrderIfFinished(item.orderId, actor);
    return this.requireItem(itemId);
  }

  /** Cancel one abaya before it ships, refunding its price first when asked. */
  async cancelItem(itemId: string, actor: Actor, reason: string, refund: boolean): Promise<ItemWithOrder> {
    const item = await this.requireItem(itemId);
    if (!isCancellable(item.stage)) {
      throw new BusinessRuleError('NOT_CANCELLABLE', 'Items cannot be cancelled after they ship.');
    }
    const amount = item.unitPriceInPaise * item.quantity;
    // Check the refund is allowed (role limit, amount left) before anything changes...
    if (refund) await this.payments.assertRefundable(actor, item.orderId, amount);
    // ...then cancel while the order is still PAID, and refund last. A full refund
    // turns the order REFUNDED, after which no stage may change.
    const cancelled = await this.changeStage(itemId, 'CANCELLED', actor, { flow: 'cancel', note: reason });
    if (refund) await this.payments.refund(actor, item.orderId, amount, reason);
    return cancelled;
  }

  /** Mark shipped: one shipment row for the parcel, then each item → SHIPPED. */
  async ship(
    orderId: string,
    itemIds: string[],
    actor: Actor,
    input: { carrier: string; trackingNumber: string; trackingUrl?: string },
  ): Promise<OrderRecord> {
    const order = await this.requireOrder(orderId);
    const items = itemIds.map((id) => order.items.find((i) => i.id === id));
    if (items.some((i) => !i)) throw new NotFoundError('Order item');
    if (items.some((i) => i!.stage !== 'PACKED')) {
      throw new BusinessRuleError('NOT_READY_TO_SHIP', 'Only packed items can ship.');
    }
    await this.orders.createShipment({ orderId, orderItemIds: itemIds, ...input });
    for (const id of itemIds) {
      await this.changeStage(id, 'SHIPPED', actor, { flow: 'ship', note: `${input.carrier} ${input.trackingNumber}` });
    }
    return this.requireOrder(orderId);
  }

  async markDelivered(itemId: string, actor: Actor, note?: string): Promise<ItemWithOrder> {
    const item = await this.changeStage(itemId, 'DELIVERED', actor, { flow: 'generic', note });
    await this.orders.markShipmentsDelivered(item.orderId, itemId);
    return item;
  }

  /** Take the job at its current stage (workshop). False when someone else already has it. */
  async claim(itemId: string, stage: ItemWithOrder['stage'], actor: Actor): Promise<boolean> {
    return this.orders.setClaim(itemId, stage, actor.userId, null);
  }

  /** Give a job back. `force` (production manager) releases anyone's claim. */
  async release(itemId: string, stage: ItemWithOrder['stage'], actor: Actor, force: boolean): Promise<boolean> {
    return this.orders.setClaim(itemId, stage, null, force ? null : actor.userId);
  }

  /** Pick (or change) the tailor and due date. No stage change; the tailor is alerted. */
  async assignMaker(itemId: string, makerId: string, dueDate: Date, actor: Actor, note: string): Promise<ItemWithOrder> {
    const item = await this.requireItem(itemId);
    await this.orders.setAssignment(itemId, { makerId, dueDate }, {
      actorUserId: actor.userId,
      action: 'order.maker_assigned',
      entityType: 'OrderItem',
      entityId: itemId,
      before: { makerId: item.makerId, dueDate: item.dueDate },
      after: { makerId, dueDate, note },
      ip: actor.ip,
    });
    await this.events.publish(EVENTS.MakerAssigned, {
      orderItemId: itemId,
      designName: item.designSnapshot.name,
      makerId,
      dueDate: dueDate.toISOString(),
      stage: item.stage,
    });
    return this.requireItem(itemId);
  }

  /** Items waiting at (or held from) these stages, for the workshop queues. */
  listForWorkshop(stages: ItemWithOrder['stage'][], opts: { makerId?: string; limit?: number } = {}): Promise<ItemWithOrder[]> {
    return this.orders.listForWorkshop({ stages, makerId: opts.makerId, limit: opts.limit ?? 300 });
  }

  getItem(itemId: string): Promise<ItemWithOrder> {
    return this.requireItem(itemId);
  }

  listItemsForMaker(makerId: string, stages: ProductionStage[], updatedSince?: Date): Promise<ItemWithOrder[]> {
    return this.orders.listItemsForMaker(makerId, stages, updatedSince);
  }

  listDoneSteps(fromStages: ProductionStage[], opts: { actorUserId?: string; since: Date; limit?: number }): Promise<DoneStepRecord[]> {
    return this.orders.listDoneSteps({ fromStages, actorUserId: opts.actorUserId, since: opts.since, limit: opts.limit ?? 200 });
  }

  findItemsByIds(ids: string[]): Promise<ItemWithOrder[]> {
    return this.orders.findItemsByIds(ids);
  }

  getOrder(orderId: string): Promise<OrderRecord> {
    return this.requireOrder(orderId);
  }

  listAdmin(query: ListAdminOrdersQuery, userIdsMatching?: string[]) {
    return this.orders.listAdmin(query, userIdsMatching);
  }

  salesOfDesigns(designIds: string[]) {
    return this.orders.salesOfDesigns(designIds);
  }

  customerSummaries(userIds?: string[]) {
    return this.orders.customerSummaries(userIds);
  }

  exportForUser(userId: string): Promise<unknown[]> {
    return this.orders.exportForUser(userId);
  }

  anonymiseForUser(userId: string): Promise<void> {
    return this.orders.anonymiseForUser(userId);
  }

  hasActiveOrders(userId: string): Promise<boolean> {
    return this.orders.hasActiveOrders(userId);
  }

  countActiveByMaker(): Promise<Map<string, number>> {
    return this.orders.countActiveByMaker();
  }

  /** Numbers for the admin dashboard. */
  async stats(now = new Date()) {
    const IST_OFFSET_MS = 330 * 60_000;
    const istMidnight = new Date(Math.floor((now.getTime() + IST_OFFSET_MS) / 86_400_000) * 86_400_000 - IST_OFFSET_MS);
    const inThreeDays = new Date(now.getTime() + 3 * 86_400_000);
    const [itemsByStage, itemsDueSoon, lateItems, today] = await Promise.all([
      this.orders.countItemsByStage(),
      this.orders.countItemsDue(inThreeDays, now),
      this.orders.countItemsDue(now),
      this.orders.paidTotalsSince(istMidnight),
    ]);
    return { itemsByStage, itemsDueSoon, lateItems, revenueTodayInPaise: today.totalInPaise, ordersToday: today.orders };
  }

  // ───────────── Event handlers ─────────────

  /** PaymentCaptured → Order PAID, placedAt set, items stay PLACED. Idempotent. */
  async handlePaymentCaptured(event: PaymentCapturedEvent): Promise<void> {
    if (!event.orderId) return; // an HD download, not an order
    const order = await this.orders.findById(event.orderId);
    if (!order) return;
    const becamePaid = await this.orders.markPaid(order.id, new Date());
    if (!becamePaid) return;
    await this.customer.clearCartAddedBefore(order.userId, order.createdAt);
    await this.events.publish(EVENTS.OrderPaid, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      totalInPaise: order.totalInPaise,
    });
  }

  /** A full refund marks the order REFUNDED. */
  async handleRefundProcessed(event: RefundProcessedEvent): Promise<void> {
    if (!event.fullyRefunded) return;
    await this.orders.setStatus(event.orderId, ['PAID', 'COMPLETED', 'CANCELLED'], 'REFUNDED', {
      actorUserId: null,
      action: 'order.refunded',
      entityType: 'Order',
      entityId: event.orderId,
      after: { status: 'REFUNDED', refundId: event.refundId },
    });
  }

  private async completeOrderIfFinished(orderId: string, actor: Actor): Promise<void> {
    const order = await this.requireOrder(orderId);
    const next = orderStatusWhenItemsFinish(order.items.map((i) => i.stage));
    if (!next || order.status !== 'PAID') return;
    await this.orders.setStatus(orderId, ['PAID'], next, {
      actorUserId: actor.userId,
      action: next === 'COMPLETED' ? 'order.completed' : 'order.cancelled',
      entityType: 'Order',
      entityId: orderId,
      before: { status: order.status },
      after: { status: next },
      ip: actor.ip,
    });
    this.logger.log({ orderId, status: next }, 'Order finished');
  }

  private async requireItem(itemId: string): Promise<ItemWithOrder> {
    const item = await this.orders.findItem(itemId);
    if (!item) throw new NotFoundError('Order item');
    return item;
  }

  private async requireOrder(orderId: string): Promise<OrderRecord> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order');
    return order;
  }
}
