import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminCustomerDto,
  AdminOrderDetail,
  AdminOrderListItem,
  DashboardDto,
  ListAdminCustomersQuery,
  ListAdminOrdersQuery,
  Paginated,
  Role,
} from '@abaya/contracts';
import {
  type CustomerAnalyticsDto,
  type CustomerAudience,
  missingTeam, PRODUCTION_TRANSITIONS } from '@abaya/contracts';
import { CatalogService } from '../../catalog/application/catalog.service';
import { IdentityService } from '../../identity/application/identity.service';
import { toItemDto } from '../../orders/application/order-views';
import { OrdersService } from '../../orders/application/orders.service';
import { ORDER_MEDIA, type OrderMedia } from '../../orders/application/ports/orders.ports';
import { PaymentsService } from '../../payments/application/payments.service';
import { MakersService } from './makers.service';
import { CuttingService } from './cutting.service';
import { PatternService } from './pattern.service';
import { StitchingService } from './stitching.service';
import { TeamService } from './team.service';
import { PRODUCTION_REPOSITORY, type ProductionRepository } from './ports/production.ports';

/** Who may see customer phone, email and address (docs/domain-model.md §6). */
const CONTACT_ROLES: Role[] = ['SUPER_ADMIN', 'PRODUCTION_MANAGER', 'SUPPORT'];
const canSeeContact = (roles: readonly Role[]) => roles.some((r) => CONTACT_ROLES.includes(r));

/** Read side of the admin Orders screens and the dashboard. */
@Injectable()
export class AdminOrdersService {
  constructor(
    @Inject(PRODUCTION_REPOSITORY) private readonly repo: ProductionRepository,
    @Inject(ORDER_MEDIA) private readonly media: OrderMedia,
    private readonly orders: OrdersService,
    private readonly identity: IdentityService,
    private readonly payments: PaymentsService,
    private readonly makers: MakersService,
    private readonly catalog: CatalogService,
    private readonly patterns: PatternService,
    private readonly cuttings: CuttingService,
    private readonly stitchings: StitchingService,
    private readonly team: TeamService,
  ) {}

  async list(query: ListAdminOrdersQuery): Promise<Paginated<AdminOrderListItem>> {
    const q = query.q?.trim();
    const userIds = q && !/^AB-/i.test(q) ? await this.identity.searchUserIds(q) : undefined;
    const page = await this.orders.listAdmin(query, userIds);
    const allItems = page.items.flatMap((o) => o.items);
    const [makers, teams] = await Promise.all([
      this.makers.namesById(allItems.map((i) => i.makerId).filter((m): m is string => Boolean(m))),
      this.team.byItem(allItems.map((i) => i.id)),
    ]);
    // Who has each job now: the person assigned to its station, or whoever took it.
    const withId = new Map(allItems.map((i) => [i.id, this.team.assigneeAt(i, teams.get(i.id)) ?? i.claimedById]));
    const contacts = await this.identity.getContacts([
      ...page.items.map((o) => o.userId),
      ...[...withId.values()].filter((u): u is string => Boolean(u)),
    ]);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalInPaise: o.totalInPaise,
        customerName: contacts.get(o.userId)?.name ?? o.shippingAddress.fullName,
        placedAt: o.placedAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
        items: o.items.map((i) => ({
          id: i.id,
          designName: i.designSnapshot.name,
          stage: i.stage,
          makerName: i.makerId ? (makers.get(i.makerId)?.name ?? null) : null,
          dueDate: i.dueDate?.toISOString() ?? null,
          withName: withId.get(i.id)
            ? (contacts.get(withId.get(i.id)!)?.name ?? contacts.get(withId.get(i.id)!)?.email ?? null)
            : i.stage === 'STITCHING' && i.makerId
              ? (makers.get(i.makerId)?.name ?? null)
              : null,
          teamComplete: missingTeam({ ...teams.get(i.id), makerId: i.makerId }).length === 0,
        })),
      })),
    };
  }

  /** Customer accounts with their order totals, newest first. Contact details only for CONTACT_ROLES. */
  async customers(viewerRoles: readonly Role[], query: ListAdminCustomersQuery): Promise<Paginated<AdminCustomerDto>> {
    const page = await this.identity.listCustomers({
      q: query.q || undefined,
      audience: query.audience,
      cursor: query.cursor,
      limit: query.limit,
    });
    const summaries = await this.orders.customerSummaries(page.items.map((u) => u.id));
    const showContact = canSeeContact(viewerRoles);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((u) => {
        const summary = summaries.get(u.id);
        return {
          id: u.id,
          name: u.name,
          email: showContact ? u.email : null,
          phone: showContact ? u.phone : null,
          isActive: u.isActive,
          isStaff: u.roles.some((r) => r !== 'CUSTOMER'),
          createdAt: u.createdAt.toISOString(),
          orderCount: summary?.orderCount ?? 0,
          totalSpentInPaise: summary?.totalSpentInPaise ?? 0,
          lastOrderAt: summary?.lastOrderAt?.toISOString() ?? null,
        };
      }),
    };
  }

  /**
   * Totals for the Customers page: accounts, new this month, buyers and repeat buyers, revenue
   * and average order value, and the top five customers by spend — for one audience.
   */
  async customerAnalytics(viewerRoles: readonly Role[], audience: CustomerAudience): Promise<CustomerAnalyticsDto> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [accounts, newThisMonth, summaries] = await Promise.all([
      this.identity.countAccounts(audience),
      this.identity.countAccounts(audience, monthStart),
      this.orders.customerSummaries(),
    ]);
    const contacts = await this.identity.getContacts([...summaries.keys()]);
    const isStaff = (id: string) => (contacts.get(id)?.roles ?? []).some((r) => r !== 'CUSTOMER');
    const rows = [...summaries.entries()].filter(([id]) =>
      audience === 'all' ? contacts.has(id) : audience === 'staff' ? isStaff(id) : contacts.has(id) && !isStaff(id),
    );
    const revenue = rows.reduce((n, [, s]) => n + s.totalSpentInPaise, 0);
    const paidOrders = rows.reduce((n, [, s]) => n + s.paidOrderCount, 0);
    const showContact = canSeeContact(viewerRoles);
    return {
      accounts,
      newThisMonth,
      buyers: rows.filter(([, s]) => s.orderCount > 0).length,
      repeatBuyers: rows.filter(([, s]) => s.orderCount > 1).length,
      paidOrders,
      revenueInPaise: revenue,
      averageOrderValueInPaise: paidOrders > 0 ? Math.round(revenue / paidOrders) : 0,
      topCustomers: rows
        .filter(([, s]) => s.totalSpentInPaise > 0)
        .sort(([, a], [, b]) => b.totalSpentInPaise - a.totalSpentInPaise)
        .slice(0, 5)
        .map(([id, s]) => ({
          id,
          name: contacts.get(id)?.name ?? null,
          email: showContact ? (contacts.get(id)?.email ?? null) : null,
          orderCount: s.orderCount,
          totalSpentInPaise: s.totalSpentInPaise,
        })),
    };
  }

  async get(viewerRoles: readonly Role[], orderId: string): Promise<AdminOrderDetail> {
    const order = await this.orders.getOrder(orderId);
    const itemIds = order.items.map((i) => i.id);
    const [techPacks, qcChecks, payments, makers, contact, patterns, cuttings, stitchings, teams] = await Promise.all([
      this.repo.findTechPacks(itemIds),
      this.repo.listQcChecks(itemIds),
      this.payments.listForOrder(orderId),
      this.makers.namesById(order.items.flatMap((i) => (i.makerId ? [i.makerId] : []))),
      canSeeContact(viewerRoles) ? this.identity.getContact(order.userId) : Promise.resolve(null),
      this.patterns.latest(itemIds),
      this.cuttings.byItem(itemIds),
      this.stitchings.byItem(itemIds),
      this.team.dtos(order.items),
    ]);

    const items = await Promise.all(
      order.items.map(async (item) => {
        const pack = techPacks.find((t) => t.orderItemId === item.id);
        const maker = item.makerId ? makers.get(item.makerId) : undefined;
        return {
          ...(await toItemDto(item, this.media)),
          maker: maker ? { id: maker.id, name: maker.name, city: maker.city } : null,
          dueDate: item.dueDate?.toISOString() ?? null,
          team: teams.get(item.id)!,
          techPack: pack
            ? {
                id: pack.id,
                status: pack.status,
                content: pack.content,
                approvedBy: pack.approvedBy,
                approvedAt: pack.approvedAt?.toISOString() ?? null,
                updatedAt: pack.updatedAt.toISOString(),
              }
            : null,
          pattern: patterns.get(item.id) ?? null,
          cuttings: cuttings.get(item.id) ?? [],
          stitchings: stitchings.get(item.id) ?? [],
          qcChecks: await Promise.all(
            qcChecks
              .filter((c) => c.orderItemId === item.id)
              .map(async (c) => ({
                id: c.id,
                result: c.result,
                checklist: c.checklist,
                notes: c.notes,
                photoUrls: await Promise.all(c.photoPaths.map((p) => this.media.stagePhotoUrl(p))),
                checkedBy: c.checkedBy,
                createdAt: c.createdAt.toISOString(),
              })),
          ),
          nextStages: order.status === 'PAID' ? [...PRODUCTION_TRANSITIONS[item.stage]] : [],
        };
      }),
    );

    const showContact = canSeeContact(viewerRoles);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotalInPaise: order.subtotalInPaise,
      shippingInPaise: order.shippingInPaise,
      discountInPaise: order.discountInPaise,
      totalInPaise: order.totalInPaise,
      customerNote: order.customerNote,
      placedAt: order.placedAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      shipments: order.shipments.map((s) => ({
        ...s,
        shippedAt: s.shippedAt?.toISOString() ?? null,
        deliveredAt: s.deliveredAt?.toISOString() ?? null,
      })),
      customer: contact ? { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone } : null,
      shippingAddress: showContact ? order.shippingAddress : null,
      items,
      payments,
    };
  }

  async dashboard(): Promise<DashboardDto> {
    const [stats, designsAwaitingReview] = await Promise.all([this.orders.stats(), this.catalog.countAwaitingReview()]);
    return { ...stats, designsAwaitingReview };
  }
}
