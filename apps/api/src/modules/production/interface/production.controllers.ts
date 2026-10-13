import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  type AdminCustomerDto,
  type AdminOrderDetail,
  type AdminOrderListItem,
  assignMakerBody,
  cancelItemBody,
  type DashboardDto,
  type ListAdminCustomersQuery,
  listAdminCustomersQuery,
  type ListAdminOrdersQuery,
  listAdminOrdersQuery,
  type MakerDto,
  markPayoutPaidBody,
  type Paginated,
  qcCheckBody,
  saveTechPackBody,
  shipItemsBody,
  stageChangeBody,
  ADMIN_PANEL_ROLES,
  updateMakerBody,
  customerAnalyticsQuery,
  type CustomerAnalyticsDto,
  type ItemTeamDto,
  teamBody,
  type TeamOptionsDto,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Roles } from '../../../common/auth/decorators';
import { ZodBody, ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { AdminOrdersService } from '../application/admin-orders.service';
import { MakersService } from '../application/makers.service';
import { ProductionService } from '../application/production.service';
import { TeamService } from '../application/team.service';
import { DEFAULT_QC_CHECKLIST } from '../domain/production.rules';

/** Staff who work on orders: everyone except designers (docs/api-conventions.md). */
const ORDER_VIEWERS = ADMIN_PANEL_ROLES.filter((r) => r !== 'DESIGNER');

@Controller('admin')
export class AdminDashboardController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Roles(...ADMIN_PANEL_ROLES)
  @Get('dashboard')
  dashboard(): Promise<DashboardDto> {
    return this.orders.dashboard();
  }
}

/** Customer accounts with order totals (docs/apps/admin.md "Customers"). */
@Controller('admin/customers')
@Roles('SUPPORT')
export class AdminCustomersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @ZodQuery(listAdminCustomersQuery) query: ListAdminCustomersQuery,
  ): Promise<Paginated<AdminCustomerDto>> {
    return this.orders.customers(actor.roles, query);
  }

  /** Accounts, buyers, repeat buyers, revenue and top customers for one audience. */
  @Get('analytics')
  analytics(
    @CurrentActor() actor: Actor,
    @ZodQuery(customerAnalyticsQuery) query: z.infer<typeof customerAnalyticsQuery>,
  ): Promise<CustomerAnalyticsDto> {
    return this.orders.customerAnalytics(actor.roles, query.audience);
  }
}

@Controller('admin/orders')
@Roles(...ORDER_VIEWERS)
export class AdminOrdersController {
  constructor(
    private readonly orders: AdminOrdersService,
    private readonly production: ProductionService,
  ) {}

  @Get()
  list(@ZodQuery(listAdminOrdersQuery) query: ListAdminOrdersQuery): Promise<Paginated<AdminOrderListItem>> {
    return this.orders.list(query);
  }

  /** Customer contact and address are included only for SUPER_ADMIN, PRODUCTION_MANAGER and SUPPORT. */
  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<AdminOrderDetail> {
    return this.orders.get(actor.roles, id);
  }

  /** Packed items only (docs/apps/workshop.md, Logistics station). */
  @Roles('PRODUCTION_MANAGER', 'LOGISTICS')
  @Post(':id/ship')
  async ship(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(shipItemsBody) body: z.infer<typeof shipItemsBody>,
  ): Promise<AdminOrderDetail> {
    await this.production.ship(actor, id, body);
    return this.orders.get(actor.roles, id);
  }
}

@Controller('admin/order-items/:itemId')
export class AdminOrderItemsController {
  constructor(
    private readonly production: ProductionService,
    private readonly team: TeamService,
  ) {}

  @Roles('PRODUCTION_MANAGER')
  @Get('tech-pack')
  techPack(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.production.getTechPack(itemId);
  }

  /** Save a draft, or approve it (item moves PLACED → SPEC_APPROVED). */
  @Roles('PRODUCTION_MANAGER')
  @Put('tech-pack')
  saveTechPack(
    @CurrentActor() actor: Actor,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @ZodBody(saveTechPackBody) body: z.infer<typeof saveTechPackBody>,
  ) {
    return this.production.saveTechPack(actor, itemId, body.content, body.approve);
  }

  /** The workshop team: one person per station (tailor + due date included). */
  @Roles('PRODUCTION_MANAGER')
  @Put('team')
  setTeam(
    @CurrentActor() actor: Actor,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @ZodBody(teamBody) body: z.infer<typeof teamBody>,
  ): Promise<ItemTeamDto> {
    return this.team.setTeam(actor, itemId, body);
  }

  @Roles('PRODUCTION_MANAGER')
  @Post('assign')
  @HttpCode(200)
  assign(
    @CurrentActor() actor: Actor,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @ZodBody(assignMakerBody) body: z.infer<typeof assignMakerBody>,
  ) {
    return this.production.assignMaker(actor, itemId, body.makerId, body.dueDate);
  }

  /** Generic steps (e.g. PATTERN → CUTTING, DELIVERED, REMAKE). Role per stage is checked in the domain. */
  @Roles('PRODUCTION_MANAGER', 'QC', 'SUPPORT')
  @Post('stage')
  @HttpCode(200)
  stage(
    @CurrentActor() actor: Actor,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @ZodBody(stageChangeBody) body: z.infer<typeof stageChangeBody>,
  ) {
    return this.production.moveStage(actor, itemId, body.to, body.note, body.photoPath);
  }

  @Roles('QC', 'PRODUCTION_MANAGER')
  @Get('qc/checklist')
  checklist(): readonly string[] {
    return DEFAULT_QC_CHECKLIST;
  }

  /** PASS moves the item on to FINISHING; FAIL sends it back (STITCHING by default) with the notes. */
  @Roles('QC', 'PRODUCTION_MANAGER')
  @Post('qc')
  qc(
    @CurrentActor() actor: Actor,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @ZodBody(qcCheckBody) body: z.infer<typeof qcCheckBody>,
  ) {
    return this.production.recordQc(actor, itemId, body);
  }

  /** Cancel before shipping, refunding the item's price (SUPPORT up to ₹5,000). */
  @Roles('SUPPORT')
  @Post('cancel')
  @HttpCode(200)
  cancel(
    @CurrentActor() actor: Actor,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @ZodBody(cancelItemBody) body: z.infer<typeof cancelItemBody>,
  ) {
    return this.production.cancelItem(actor, itemId, body.reason, body.refund);
  }
}

@Controller('admin/makers')
@Roles('PRODUCTION_MANAGER')
export class AdminMakersController {
  constructor(private readonly makers: MakersService) {}

  @Get()
  list(): Promise<MakerDto[]> {
    return this.makers.list();
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateMakerBody) body: z.infer<typeof updateMakerBody>,
  ): Promise<MakerDto> {
    return this.makers.update(actor, id, body);
  }

  @Get(':id/payouts')
  payouts(@Param('id', ParseUUIDPipe) id: string) {
    return this.makers.payouts(id);
  }

  @Post(':id/payouts/:payoutId/paid')
  @HttpCode(200)
  markPaid(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @ZodBody(markPayoutPaidBody) body: z.infer<typeof markPayoutPaidBody>,
  ) {
    return this.makers.markPayoutPaid(actor, id, payoutId, body.reference);
  }
}

/** Pickers for the Assign team dialog: people per station with their open jobs. */
@Controller('admin/team-options')
@Roles('PRODUCTION_MANAGER')
export class AdminTeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  options(): Promise<TeamOptionsDto> {
    return this.team.options();
  }
}
