import { Inject, Injectable } from '@nestjs/common';
import type { ProductionStage, QC_SEND_BACK_STAGES, TechPackContent } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../common/errors/domain-error';
import { CatalogService } from '../../catalog/application/catalog.service';
import { UploadsService } from '../../media/application/uploads.service';
import { OrdersService } from '../../orders/application/orders.service';
import {
  assertAssignable,
  assertQcAllowed,
  assertReadyToShip,
  assertTechPackEditable,
  draftTechPack,
  type QcInput,
} from '../domain/production.rules';
import { PatternService } from './pattern.service';
import { TeamService } from './team.service';
import { PRODUCTION_REPOSITORY, type ProductionRepository, type TechPackRecord } from './ports/production.ports';

/**
 * Production workflow per order item (docs/apps/admin.md "Order detail"):
 * tech pack → assign tailor → cutting → stitching → QC → ship → deliver.
 * Every stage move goes through OrdersService.changeStage.
 */
@Injectable()
export class ProductionService {
  constructor(
    @Inject(PRODUCTION_REPOSITORY) private readonly repo: ProductionRepository,
    private readonly orders: OrdersService,
    private readonly catalog: CatalogService,
    private readonly uploads: UploadsService,
    private readonly patterns: PatternService,
    private readonly team: TeamService,
  ) {}

  /** The saved tech pack, or a draft built from the order snapshot. */
  async getTechPack(itemId: string): Promise<{ saved: TechPackRecord | null; draft: TechPackContent }> {
    const item = await this.orders.getItem(itemId);
    return {
      saved: await this.repo.findTechPack(itemId),
      draft: draftTechPack({
        style: item.designSnapshot.style,
        options: item.optionsSnapshot,
        sizeBandCode: item.sizeBandCode,
        measurements: item.measurementsSnapshot,
      }),
    };
  }

  async saveTechPack(actor: Actor, itemId: string, content: TechPackContent, approve: boolean): Promise<TechPackRecord> {
    const item = await this.orders.getItem(itemId);
    // Checked before any write so an approval can never be saved without its stage change.
    if (item.order.status !== 'PAID') {
      throw new BusinessRuleError('ORDER_NOT_PAID', 'Production can only change on a paid order.');
    }
    const existing = await this.repo.findTechPack(itemId);
    assertTechPackEditable(item.stage, existing?.status === 'APPROVED');
    for (const path of content.referenceImagePaths) this.uploads.assertPath('REFERENCE_IMAGE', path);

    if (!approve) return this.repo.saveTechPack(itemId, content, null);
    // Approving starts production: every station needs its person (docs/apps/workshop.md "Team").
    await this.team.assertComplete(item);

    const saved = await this.repo.saveTechPack(itemId, content, actor.userId, {
      actorUserId: actor.userId,
      action: 'tech_pack.approved',
      entityType: 'OrderItem',
      entityId: itemId,
      after: { techPack: 'APPROVED' },
      ip: actor.ip,
    });
    await this.orders.changeStage(itemId, 'SPEC_APPROVED', actor, { flow: 'tech-pack', note: 'Tech pack approved' });
    return saved;
  }

  /** Pick (or change) the tailor who will stitch this item. No stage change. */
  async assignMaker(actor: Actor, itemId: string, makerId: string, dueDate: Date) {
    const [item, maker] = await Promise.all([this.orders.getItem(itemId), this.repo.findMaker(makerId)]);
    if (!maker) throw new NotFoundError('Maker');
    if (item.order.status !== 'PAID') {
      throw new BusinessRuleError('ORDER_NOT_PAID', 'Production can only change on a paid order.');
    }
    assertAssignable({ stage: item.stage, makerActive: maker.isActive, dueDate });
    return this.orders.assignMaker(itemId, makerId, dueDate, actor, `Assigned to ${maker.name}, due ${dueDate.toISOString().slice(0, 10)}`);
  }

  /** Generic steps from the admin panel (production manager); photos where a station would need them. */
  async moveStage(actor: Actor, itemId: string, to: ProductionStage, note?: string, photoPath?: string) {
    if (to === 'DELIVERED') return this.orders.markDelivered(itemId, actor, note);
    const { stage } = await this.orders.getItem(itemId);
    // Pattern → cutting needs a complete pattern here too; cutting → stitching needs the cutting record.
    if (to === 'CUTTING' && stage === 'PATTERN') await this.patterns.confirmForCutting(actor, itemId);
    if (to === 'STITCHING' && stage === 'CUTTING') {
      throw new BusinessRuleError('USE_CUTTING_FORM', 'Record the cut at the workshop Cutting station.');
    }
    if (to === 'QC' && stage === 'STITCHING') {
      throw new BusinessRuleError('USE_STITCHING_FORM', 'The tailor finishes stitching at the workshop Stitching station.');
    }
    return this.orders.changeStage(itemId, to, actor, { flow: 'generic', note, photoPath });
  }

  async recordQc(
    actor: Actor,
    itemId: string,
    input: QcInput & { photoPaths: string[]; sendBackTo?: (typeof QC_SEND_BACK_STAGES)[number] },
  ) {
    const item = await this.orders.getItem(itemId);
    // An assigned quality check is for that person (the production manager may record it too).
    const qcBy = (await this.team.byItem([itemId])).get(itemId)?.qc;
    const manager = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('PRODUCTION_MANAGER');
    if (qcBy && qcBy !== actor.userId && !manager) {
      throw new ForbiddenError('This quality check is assigned to someone else.', 'NOT_ASSIGNED');
    }
    const last = (await this.repo.listQcChecks([itemId])).at(-1);
    assertQcAllowed(item.stage, input, last?.result ?? null);
    for (const path of input.photoPaths) this.uploads.assertPath('QC_PHOTO', path);

    const check = await this.repo.addQcCheck(
      {
        orderItemId: itemId,
        result: input.result,
        checklist: input.checklist,
        notes: input.notes ?? null,
        photoPaths: input.photoPaths,
        checkedById: actor.userId,
      },
      {
        actorUserId: actor.userId,
        action: 'qc.recorded',
        entityType: 'OrderItem',
        entityId: itemId,
        after: { result: input.result, notes: input.notes ?? null },
        ip: actor.ip,
      },
    );

    if (input.result === 'FAIL') {
      // Back to the station that must fix it (the tailor by default); the photo documents the problem.
      await this.orders.changeStage(itemId, input.sendBackTo ?? 'STITCHING', actor, {
        flow: 'qc',
        note: `QC failed: ${input.notes}`,
        photoPath: input.photoPaths[0],
      });
      return check;
    }
    if (item.makerId) {
      const cost = await this.catalog.getMakingCost(item.designId);
      // One payout per tailor per abaya, even if two PASS requests race.
      if (cost && cost > 0) await this.repo.createPayoutOnce({ makerId: item.makerId, orderItemId: itemId, amountInPaise: cost });
    }
    // Passed: on to finishing and packing.
    await this.orders.changeStage(itemId, 'FINISHING', actor, { flow: 'qc', note: input.notes?.trim() || 'QC passed' });
    return check;
  }

  async ship(actor: Actor, orderId: string, input: { orderItemIds: string[]; carrier: string; trackingNumber: string; trackingUrl?: string }) {
    const order = await this.orders.getOrder(orderId);
    const checks = await this.repo.listQcChecks(input.orderItemIds);
    for (const id of input.orderItemIds) {
      const item = order.items.find((i) => i.id === id);
      if (!item) throw new NotFoundError('Order item');
      const last = checks.filter((c) => c.orderItemId === id).at(-1);
      assertReadyToShip(item.stage, last?.result ?? null);
    }
    return this.orders.ship(orderId, input.orderItemIds, actor, input);
  }

  cancelItem(actor: Actor, itemId: string, reason: string, refund: boolean) {
    return this.orders.cancelItem(itemId, actor, reason, refund);
  }
}
