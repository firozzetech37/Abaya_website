import { Injectable } from '@nestjs/common';
import type { OrderStatus, Prisma, ProductionStage } from '@abaya/db';
import {
  ACTIVE_PRODUCTION_STAGES,
  type AddressSnapshot,
  type ListAdminOrdersQuery,
  type PriceBreakdown,
  type SelectedOptionDto,
} from '@abaya/contracts';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { pageArgs, toPage } from '../../../common/pagination';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CustomerOrderSummary,
  DesignSnapshotJson,
  OrderItemRecord,
  OrderRecord,
  OrderRepository,
  ShipmentRecord,
  StageChange,
} from '../application/ports/orders.ports';

const itemInclude = {
  stageEvents: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderItemInclude;

const orderInclude = {
  items: { include: itemInclude, orderBy: { createdAt: 'asc' } },
  shipments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

type ItemRow = Prisma.OrderItemGetPayload<{ include: typeof itemInclude }>;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type OrderOnlyRow = Prisma.OrderGetPayload<object>;

const toItem = (i: ItemRow): OrderItemRecord => ({
  id: i.id,
  orderId: i.orderId,
  designId: i.designId,
  designSnapshot: i.designSnapshot as unknown as DesignSnapshotJson,
  optionsSnapshot: i.optionsSnapshot as unknown as SelectedOptionDto[],
  sizeBandCode: i.sizeBandCode,
  measurementsSnapshot: i.measurementsSnapshot as Record<string, number | string | null> | null,
  priceBreakdown: i.priceBreakdown as unknown as PriceBreakdown,
  unitPriceInPaise: i.unitPriceInPaise,
  quantity: i.quantity,
  stage: i.stage,
  makerId: i.makerId,
  dueDate: i.dueDate,
  claimedById: i.claimedById,
  aiPreviewPath: i.aiPreviewPath,
  aiPreviewInspiration: i.aiPreviewInspiration,
  claimedAt: i.claimedAt,
  heldFromStage: i.heldFromStage,
  holdReason: i.holdReason,
  stageEvents: i.stageEvents.map((e) => ({
    id: e.id,
    fromStage: e.fromStage,
    toStage: e.toStage,
    actorUserId: e.actorUserId,
    note: e.note,
    photoPath: e.photoPath,
    createdAt: e.createdAt,
  })),
});

const toShipment = (s: OrderRow['shipments'][number]): ShipmentRecord => ({
  id: s.id,
  carrier: s.carrier,
  trackingNumber: s.trackingNumber,
  trackingUrl: s.trackingUrl,
  status: s.status,
  orderItemIds: s.orderItemIds,
  shippedAt: s.shippedAt,
  deliveredAt: s.deliveredAt,
});

const toOrderOnly = (o: OrderOnlyRow): Omit<OrderRecord, 'items' | 'shipments'> => ({
  id: o.id,
  orderNumber: o.orderNumber,
  userId: o.userId,
  status: o.status,
  subtotalInPaise: o.subtotalInPaise,
  shippingInPaise: o.shippingInPaise,
  discountInPaise: o.discountInPaise,
  totalInPaise: o.totalInPaise,
  shippingAddress: o.shippingAddress as unknown as AddressSnapshot,
  customerNote: o.customerNote,
  placedAt: o.placedAt,
  cancelledAt: o.cancelledAt,
  createdAt: o.createdAt,
});

const toOrder = ({ items, shipments, ...o }: OrderRow): OrderRecord => ({
  ...toOrderOnly(o),
  items: items.map(toItem),
  shipments: shipments.map(toShipment),
});

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const FINISHED: ProductionStage[] = ['SHIPPED', 'DELIVERED', 'CANCELLED'];

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  async listOldAiPreviews(before: Date, limit: number) {
    const rows = await this.db.orderItem.findMany({
      where: {
        aiPreviewPath: { not: null },
        stage: { in: ['DELIVERED', 'CANCELLED'] },
        stageEvents: { some: { toStage: { in: ['DELIVERED', 'CANCELLED'] }, createdAt: { lt: before } } },
      },
      select: { id: true, aiPreviewPath: true },
      take: limit,
    });
    return rows.map((r) => ({ itemId: r.id, path: r.aiPreviewPath! }));
  }

  async clearAiPreviews(itemIds: string[]) {
    if (itemIds.length === 0) return;
    await this.db.orderItem.updateMany({ where: { id: { in: itemIds } }, data: { aiPreviewPath: null } });
  }

  constructor(private readonly db: PrismaService) {}

  async nextOrderSequence(): Promise<number> {
    const [row] = await this.db.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
    return Number(row!.n);
  }

  async createPending(input: Parameters<OrderRepository['createPending']>[0]): Promise<OrderRecord> {
    const row = await this.db.order.create({
      data: {
        orderNumber: input.orderNumber,
        userId: input.userId,
        subtotalInPaise: input.subtotalInPaise,
        totalInPaise: input.totalInPaise,
        shippingAddress: json(input.shippingAddress),
        customerNote: input.customerNote,
        items: {
          create: input.items.map((i) => ({
            designId: i.designId,
            designSnapshot: json(i.designSnapshot),
            optionsSnapshot: json(i.optionsSnapshot),
            sizeBandCode: i.sizeBandCode,
            measurementsSnapshot: i.measurementsSnapshot ? json(i.measurementsSnapshot) : undefined,
            priceBreakdown: json(i.priceBreakdown),
            unitPriceInPaise: i.unitPriceInPaise,
            quantity: 1,
            aiPreviewPath: i.aiPreviewPath ?? null,
            aiPreviewInspiration: i.aiPreviewInspiration ?? false,
          })),
        },
      },
      include: orderInclude,
    });
    return toOrder(row);
  }

  async findById(id: string) {
    const row = await this.db.order.findUnique({ where: { id }, include: orderInclude });
    return row ? toOrder(row) : null;
  }

  async findByNumber(orderNumber: string) {
    const row = await this.db.order.findUnique({ where: { orderNumber }, include: orderInclude });
    return row ? toOrder(row) : null;
  }

  async listForUser(userId: string, cursor: string | undefined, limit: number) {
    const rows = await this.db.order.findMany({
      // Unpaid, failed or abandoned checkouts are not orders from the customer's point of view.
      where: { userId, placedAt: { not: null } },
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(cursor, limit),
    });
    return toPage(rows, limit, toOrder);
  }

  async listAdmin(query: ListAdminOrdersQuery, userIdsMatching?: string[]) {
    const q = query.q?.trim();
    const where: Prisma.OrderWhereInput = {
      status: query.status ?? { not: 'PENDING_PAYMENT' },
      ...(query.customerId ? { userId: query.customerId } : {}),
      ...(query.stage ? { items: { some: { stage: query.stage } } } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q.toUpperCase() } },
              ...(userIdsMatching && userIdsMatching.length > 0 ? [{ userId: { in: userIdsMatching } }] : []),
            ],
          }
        : {}),
    };
    const rows = await this.db.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ placedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(query.cursor, query.limit),
    });
    return toPage(rows, query.limit, toOrder);
  }

  async customerSummaries(userIds?: string[]) {
    const summaries = new Map<string, CustomerOrderSummary>();
    if (userIds && userIds.length === 0) return summaries;
    const users = userIds ? { userId: { in: userIds } } : {};
    const [placed, spent] = await Promise.all([
      this.db.order.groupBy({
        by: ['userId'],
        // Placed = paid at some point; failed or abandoned checkouts are not orders.
        where: { ...users, placedAt: { not: null } },
        _count: { _all: true },
        _max: { placedAt: true },
      }),
      this.db.order.groupBy({
        by: ['userId'],
        where: { ...users, status: { in: ['PAID', 'COMPLETED'] } },
        _sum: { totalInPaise: true },
        _count: { _all: true },
      }),
    ]);
    for (const row of placed) {
      summaries.set(row.userId, { orderCount: row._count._all, totalSpentInPaise: 0, paidOrderCount: 0, lastOrderAt: row._max.placedAt });
    }
    for (const row of spent) {
      const summary = summaries.get(row.userId);
      if (summary) {
        summary.totalSpentInPaise = row._sum.totalInPaise ?? 0;
        summary.paidOrderCount = row._count._all;
      }
    }
    return summaries;
  }

  async findItem(itemId: string) {
    const row = await this.db.orderItem.findUnique({ where: { id: itemId }, include: { ...itemInclude, order: true } });
    if (!row) return null;
    const { order, ...item } = row;
    return { ...toItem(item), order: toOrderOnly(order) };
  }

  async listItemsForMaker(makerId: string, stages: ProductionStage[], updatedSince?: Date) {
    const rows = await this.db.orderItem.findMany({
      where: {
        makerId,
        stage: { in: stages },
        order: { status: { in: ['PAID', 'COMPLETED'] } },
        ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      },
      include: { ...itemInclude, order: true },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 200,
    });
    return rows.map(({ order, ...item }) => ({ ...toItem(item), order: toOrderOnly(order) }));
  }

  async findItemsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db.orderItem.findMany({ where: { id: { in: ids } }, include: { ...itemInclude, order: true } });
    return rows.map(({ order, ...item }) => ({ ...toItem(item), order: toOrderOnly(order) }));
  }

  async listDoneSteps(filter: { fromStages: ProductionStage[]; actorUserId?: string; since: Date; limit: number }) {
    // Forward steps only: not a hold, a cancel, or a move within the same station.
    return this.db.orderStageEvent.findMany({
      where: {
        fromStage: { in: filter.fromStages },
        toStage: { notIn: [...filter.fromStages, 'ON_HOLD', 'CANCELLED'] },
        createdAt: { gte: filter.since },
        ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
      },
      select: { orderItemId: true, toStage: true, actorUserId: true, note: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
    });
  }

  async listForWorkshop(filter: { stages: ProductionStage[]; makerId?: string; limit: number }) {
    const rows = await this.db.orderItem.findMany({
      where: {
        order: { status: 'PAID' },
        OR: [{ stage: { in: filter.stages } }, { stage: 'ON_HOLD', heldFromStage: { in: filter.stages } }],
        ...(filter.makerId ? { makerId: filter.makerId } : {}),
      },
      include: { ...itemInclude, order: true },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: filter.limit,
    });
    return rows.map(({ order, ...item }) => ({ ...toItem(item), order: toOrderOnly(order) }));
  }

  async setClaim(itemId: string, stage: ProductionStage, claimedById: string | null, onlyIfClaimedBy: string | null) {
    const updated = await this.db.orderItem.updateMany({
      where: {
        id: itemId,
        stage,
        ...(claimedById ? { claimedById: null } : onlyIfClaimedBy ? { claimedById: onlyIfClaimedBy } : {}),
      },
      data: { claimedById, claimedAt: claimedById ? new Date() : null },
    });
    return updated.count > 0;
  }

  async setAssignment(itemId: string, set: { makerId: string; dueDate: Date }, audit: AuditEntry) {
    await this.db.$transaction(async (tx) => {
      await tx.orderItem.update({ where: { id: itemId }, data: set });
      await writeAudit(tx, audit);
    });
  }

  changeStage(change: StageChange): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      // Optimistic check: only move the item if nobody moved it since we read it.
      const updated = await tx.orderItem.updateMany({
        where: { id: change.itemId, stage: change.from },
        data: { stage: change.to, ...(change.set ?? {}) },
      });
      if (updated.count === 0) return false;
      await tx.orderStageEvent.create({
        data: {
          orderItemId: change.itemId,
          fromStage: change.from,
          toStage: change.to,
          actorUserId: change.actorUserId,
          note: change.note,
          photoPath: change.photoPath,
        },
      });
      await writeAudit(tx, change.audit);
      return true;
    });
  }

  async markPaid(orderId: string, placedAt: Date) {
    return this.db.$transaction(async (tx) => {
      // A payment that arrives after the checkout was closed unpaid (expired) still counts:
      // the money was taken, so the order is placed.
      const updated = await tx.order.updateMany({
        where: { id: orderId, OR: [{ status: 'PENDING_PAYMENT' }, { status: 'CANCELLED', placedAt: null }] },
        data: { status: 'PAID', placedAt, cancelledAt: null },
      });
      if (updated.count === 0) return false;
      // The first timeline entry the customer sees: "Order placed".
      const items = await tx.orderItem.findMany({ where: { orderId }, select: { id: true } });
      await tx.orderStageEvent.createMany({
        data: items.map((i) => ({ orderItemId: i.id, fromStage: null, toStage: 'PLACED' as const, note: 'Payment received' })),
      });
      return true;
    });
  }

  async salesOfDesigns(designIds: string[]) {
    if (designIds.length === 0) return { items: 0, revenueInPaise: 0 };
    const rows = await this.db.orderItem.findMany({
      where: { designId: { in: designIds }, order: { status: { in: ['PAID', 'COMPLETED'] } }, stage: { not: 'CANCELLED' } },
      select: { unitPriceInPaise: true, quantity: true },
    });
    return {
      items: rows.reduce((n, r) => n + r.quantity, 0),
      revenueInPaise: rows.reduce((n, r) => n + r.unitPriceInPaise * r.quantity, 0),
    };
  }

  async expireUnpaid(olderThan: Date, limit = 200) {
    const stale = await this.db.order.findMany({
      where: { status: 'PENDING_PAYMENT', createdAt: { lt: olderThan } },
      select: { id: true },
      take: limit,
    });
    return stale.map((o) => o.id);
  }

  setStatus(orderId: string, from: OrderStatus[], to: OrderStatus, audit: AuditEntry, extra?: { cancellationNote?: string }) {
    return this.db.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: from } },
        data: {
          status: to,
          ...(to === 'CANCELLED' ? { cancelledAt: new Date(), cancellationNote: extra?.cancellationNote } : {}),
        },
      });
      if (updated.count === 0) return false;
      await writeAudit(tx, audit);
      return true;
    });
  }

  async createShipment(input: { orderId: string; orderItemIds: string[]; carrier: string; trackingNumber: string; trackingUrl?: string }) {
    const row = await this.db.shipment.create({
      data: { ...input, status: 'SHIPPED', shippedAt: new Date() },
    });
    return toShipment(row);
  }

  async markShipmentsDelivered(orderId: string, orderItemId: string) {
    const shipments = await this.db.shipment.findMany({ where: { orderId, orderItemIds: { has: orderItemId } } });
    for (const s of shipments) {
      const items = await this.db.orderItem.findMany({ where: { id: { in: s.orderItemIds } }, select: { stage: true } });
      if (items.every((i) => i.stage === 'DELIVERED' || i.stage === 'CANCELLED')) {
        await this.db.shipment.update({ where: { id: s.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      }
    }
  }

  async countItemsByStage() {
    const rows = await this.db.orderItem.groupBy({
      by: ['stage'],
      where: { order: { status: 'PAID' } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.stage, r._count._all]));
  }

  async countActiveByMaker() {
    const rows = await this.db.orderItem.groupBy({
      by: ['makerId'],
      where: { makerId: { not: null }, stage: { in: [...ACTIVE_PRODUCTION_STAGES] }, order: { status: 'PAID' } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.makerId!, r._count._all]));
  }

  countItemsDue(before: Date, after?: Date) {
    return this.db.orderItem.count({
      where: {
        order: { status: 'PAID' },
        stage: { notIn: FINISHED },
        dueDate: { lt: before, ...(after ? { gte: after } : {}) },
      },
    });
  }

  async paidTotalsSince(since: Date) {
    const result = await this.db.order.aggregate({
      where: { placedAt: { gte: since }, status: { in: ['PAID', 'COMPLETED'] } },
      _sum: { totalInPaise: true },
      _count: { _all: true },
    });
    return { orders: result._count._all, totalInPaise: result._sum.totalInPaise ?? 0 };
  }

  async exportForUser(userId: string) {
    const rows = await this.db.order.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: 'asc' } });
    return rows.map(toOrder);
  }

  async anonymiseForUser(userId: string) {
    // Orders are kept for accounting (GST); personal details in them are removed.
    const orders = await this.db.order.findMany({ where: { userId }, select: { id: true, shippingAddress: true } });
    for (const o of orders) {
      const a = o.shippingAddress as unknown as AddressSnapshot;
      await this.db.order.update({
        where: { id: o.id },
        data: {
          customerNote: null,
          shippingAddress: json({
            fullName: '[deleted]',
            phone: '[deleted]',
            line1: '[deleted]',
            line2: null,
            landmark: null,
            city: a.city,
            state: a.state,
            pincode: a.pincode,
            country: a.country,
          }),
        },
      });
    }
    // Body measurements are personal data and not needed for accounting.
    await this.db.$executeRaw`UPDATE "OrderItem" SET "measurementsSnapshot" = NULL WHERE "orderId" IN (SELECT id FROM "Order" WHERE "userId" = ${userId}::uuid)`;
  }

  async hasActiveOrders(userId: string) {
    const count = await this.db.orderItem.count({
      where: { order: { userId, status: 'PAID' }, stage: { notIn: ['DELIVERED', 'CANCELLED'] } },
    });
    return count > 0;
  }
}
