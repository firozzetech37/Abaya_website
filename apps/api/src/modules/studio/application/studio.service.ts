import { Inject, Injectable } from '@nestjs/common';
import type { StudioSummaryDto } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { DesignsAdminService } from '../../catalog/application/designs-admin.service';
import { ReferencesService } from '../../catalog/application/references.service';
import { OrdersService } from '../../orders/application/orders.service';
import { startOfIndiaDay } from '../domain/studio.rules';
import { STUDIO_REPOSITORY, type StudioRepository } from './ports/studio.ports';

/** Studio home: the designer's own designs, approval time, sales and today's AI use. */
@Injectable()
export class StudioService {
  constructor(
    @Inject(STUDIO_REPOSITORY) private readonly repo: StudioRepository,
    private readonly designs: DesignsAdminService,
    private readonly references: ReferencesService,
    private readonly orders: OrdersService,
  ) {}

  async summary(actor: Actor, now = new Date()): Promise<StudioSummaryDto> {
    const mine = await this.designs.designerSummary(actor.userId);
    const [sales, aiToday, waiting] = await Promise.all([
      this.orders.salesOfDesigns(mine.designIds),
      this.repo.countSince(actor.userId, startOfIndiaDay(now)),
      this.references.countWaitingFor(actor.userId),
    ]);
    return {
      byStatus: mine.byStatus,
      averageApprovalHours: mine.averageApprovalHours,
      needsAttention: mine.needsAttention,
      orders: sales.items,
      revenueInPaise: sales.revenueInPaise,
      aiGenerationsToday: aiToday,
      assignedReferences: waiting,
    };
  }
}
