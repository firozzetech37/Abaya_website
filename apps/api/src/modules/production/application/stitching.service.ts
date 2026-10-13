import { Inject, Injectable } from '@nestjs/common';
import {
  type ChecklistLine,
  finishedCm,
  missingForQc,
  SELF_CHECK_POINTS,
  type SelfCheckPoint,
  selfCheckLevel,
  type StitchingBody,
  stitchingChecklist,
  type StitchingDto,
  type TailorEarningsDto,
} from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError } from '../../../common/errors/domain-error';
import { UploadsService } from '../../media/application/uploads.service';
import { OrdersService } from '../../orders/application/orders.service';
import { ORDER_MEDIA, type OrderMedia } from '../../orders/application/ports/orders.ports';
import { MakersService } from './makers.service';
import {
  type PatternRecord,
  PRODUCTION_REPOSITORY,
  type ProductionRepository,
  type StitchingRecordRow,
  type TechPackRecord,
} from './ports/production.ports';

/** What the tailor must tick and measure, from the approved tech pack and confirmed pattern. */
export function stitchingExpectations(pack: TechPackRecord | null, pattern: PatternRecord | null) {
  const finished = (key: SelfCheckPoint): number | undefined => {
    const m = pattern?.content.measurements.find((x) => x.key === key);
    return m && m.bodyCm !== null ? finishedCm(m.bodyCm, m.easeCm) : undefined;
  };
  const targets: Partial<Record<SelfCheckPoint, number>> = {};
  for (const p of SELF_CHECK_POINTS) {
    const t = finished(p);
    if (t !== undefined) targets[p] = t;
  }
  const checklist: ChecklistLine[] = stitchingChecklist({
    techPack: pack?.status === 'APPROVED' ? pack.content : null,
    pieces: pattern?.content.pieces ?? [],
    finishedLengthCm: targets.fullLengthCm ?? null,
  });
  return { checklist, targets };
}

/** Stitching station records (tailor's checklist, self-check, time) and the tailor's earnings. */
@Injectable()
export class StitchingService {
  constructor(
    @Inject(PRODUCTION_REPOSITORY) private readonly repo: ProductionRepository,
    @Inject(ORDER_MEDIA) private readonly media: OrderMedia,
    private readonly uploads: UploadsService,
    private readonly makers: MakersService,
    private readonly orders: OrdersService,
  ) {}

  assertComplete(body: StitchingBody, expected: ReturnType<typeof stitchingExpectations>): void {
    this.uploads.assertPath('STAGE_PHOTO', body.photoPath);
    const gaps = missingForQc(body, expected);
    if (gaps.length > 0) throw new BusinessRuleError('STITCHING_INCOMPLETE', `Stitching still needs: ${gaps.join(', ')}.`, { missing: gaps });
  }

  record(
    actor: Actor,
    item: { id: string; makerId: string | null; claimedAt: Date | null },
    body: StitchingBody,
    expected: ReturnType<typeof stitchingExpectations>,
  ): Promise<StitchingRecordRow> {
    const done = new Set(body.checklist.filter((c) => c.done).map((c) => c.key));
    return this.repo.addStitching(
      {
        orderItemId: item.id,
        checklist: expected.checklist.map((l) => ({ ...l, done: done.has(l.key) })),
        measurements: body.measurements.map((m) => ({ ...m, targetCm: expected.targets[m.key] ?? null })),
        notes: body.notes.trim(),
        photoPath: body.photoPath,
        makerId: item.makerId,
        stitchedById: actor.userId,
        startedAt: item.claimedAt,
      },
      {
        actorUserId: actor.userId,
        action: 'stitching.recorded',
        entityType: 'OrderItem',
        entityId: item.id,
        after: { measurements: body.measurements, startedAt: item.claimedAt?.toISOString() ?? null },
        ip: actor.ip,
      },
    );
  }

  async byItem(itemIds: string[]): Promise<Map<string, StitchingDto[]>> {
    const rows = await this.repo.listStitchings(itemIds);
    const makers = await this.makers.namesById(rows.flatMap((r) => (r.makerId ? [r.makerId] : [])));
    const out = new Map<string, StitchingDto[]>();
    for (const r of rows) {
      const hours = r.startedAt ? Math.round(((r.createdAt.getTime() - r.startedAt.getTime()) / 3_600_000) * 10) / 10 : null;
      out.set(r.orderItemId, [
        ...(out.get(r.orderItemId) ?? []),
        {
          attempt: r.attempt,
          checklist: r.checklist,
          measurements: r.measurements.map((m) => ({
            ...m,
            diffCm: m.targetCm === null ? null : Math.round((m.measuredCm - m.targetCm) * 10) / 10,
            level: m.targetCm === null ? null : selfCheckLevel(m.measuredCm, m.targetCm),
          })),
          notes: r.notes,
          photoUrl: r.photoPath ? await this.media.stagePhotoUrl(r.photoPath) : null,
          startedAt: r.startedAt?.toISOString() ?? null,
          finishedAt: r.createdAt.toISOString(),
          hours,
          stitchedBy: r.stitchedBy,
          makerName: r.makerId ? (makers.get(r.makerId)?.name ?? null) : null,
        },
      ]);
    }
    return out;
  }

  /** The tailor's payouts: pending, paid this month, paid in total, and the latest 20. */
  async earnings(makerId: string, now = new Date()): Promise<TailorEarningsDto> {
    const payouts = await this.repo.listPayouts(makerId);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const items = await this.orders.findItemsByIds(payouts.flatMap((p) => (p.orderItemId ? [p.orderItemId] : [])));
    const byId = new Map(items.map((i) => [i.id, i]));
    const sum = (list: typeof payouts) => list.reduce((n, p) => n + p.amountInPaise, 0);
    return {
      pendingInPaise: sum(payouts.filter((p) => p.status === 'PENDING')),
      paidThisMonthInPaise: sum(payouts.filter((p) => p.status === 'PAID' && p.paidAt && p.paidAt >= monthStart)),
      paidTotalInPaise: sum(payouts.filter((p) => p.status === 'PAID')),
      recent: payouts.slice(0, 20).map((p) => {
        const item = p.orderItemId ? byId.get(p.orderItemId) : undefined;
        return {
          orderNumber: item?.order.orderNumber ?? null,
          designName: item?.designSnapshot.name ?? null,
          amountInPaise: p.amountInPaise,
          status: p.status,
          paidAt: p.paidAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        };
      }),
    };
  }
}
