import { Inject, Injectable } from '@nestjs/common';
import { type CuttingBody, type CuttingDto, fabricVariancePercent, missingForStitching } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError } from '../../../common/errors/domain-error';
import { UploadsService } from '../../media/application/uploads.service';
import { ORDER_MEDIA, type OrderMedia } from '../../orders/application/ports/orders.ports';
import {
  type CuttingRecordRow,
  type PatternRecord,
  PRODUCTION_REPOSITORY,
  type ProductionRepository,
} from './ports/production.ports';

/** Cutting station records: lot, metres against the pattern's estimate, pieces, photo. */
@Injectable()
export class CuttingService {
  constructor(
    @Inject(PRODUCTION_REPOSITORY) private readonly repo: ProductionRepository,
    @Inject(ORDER_MEDIA) private readonly media: OrderMedia,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * Checks the cut against the confirmed pattern (every piece ticked, lot, colour, metres,
   * photo; a note when fabric use is over the limit). Throws CUTTING_INCOMPLETE with the gaps.
   */
  assertComplete(body: CuttingBody, pattern: PatternRecord | null): void {
    if (!pattern) throw new BusinessRuleError('PATTERN_MISSING', 'This item has no confirmed pattern to cut from.');
    this.uploads.assertPath('STAGE_PHOTO', body.photoPath);
    const gaps = missingForStitching(body, pattern.content);
    if (gaps.length > 0) {
      throw new BusinessRuleError('CUTTING_INCOMPLETE', `Cutting still needs: ${gaps.join(', ')}.`, { missing: gaps });
    }
  }

  record(actor: Actor, itemId: string, body: CuttingBody, pattern: PatternRecord): Promise<CuttingRecordRow> {
    return this.repo.addCutting(
      {
        orderItemId: itemId,
        fabricLot: body.fabricLot.trim(),
        colourConfirmed: body.colourConfirmed,
        fabricUsedCm: body.fabricUsedCm,
        estimateCm: pattern.content.fabricLengthCm,
        wastageCm: body.wastageCm,
        liningUsedCm: body.liningUsedCm,
        pieces: body.pieces,
        notes: body.notes.trim(),
        photoPath: body.photoPath,
        cutById: actor.userId,
      },
      {
        actorUserId: actor.userId,
        action: 'cutting.recorded',
        entityType: 'OrderItem',
        entityId: itemId,
        after: {
          fabricLot: body.fabricLot.trim(),
          fabricUsedCm: body.fabricUsedCm,
          estimateCm: pattern.content.fabricLengthCm,
          variancePercent: fabricVariancePercent(body.fabricUsedCm, pattern.content.fabricLengthCm),
        },
        ip: actor.ip,
      },
    );
  }

  /** Cutting records per item (newest attempt first), for job cards and the order page. */
  async byItem(itemIds: string[]): Promise<Map<string, CuttingDto[]>> {
    const out = new Map<string, CuttingDto[]>();
    for (const r of await this.repo.listCuttings(itemIds)) {
      out.set(r.orderItemId, [...(out.get(r.orderItemId) ?? []), await this.toDto(r)]);
    }
    return out;
  }

  private async toDto(r: CuttingRecordRow): Promise<CuttingDto> {
    return {
      attempt: r.attempt,
      fabricLot: r.fabricLot,
      colourConfirmed: r.colourConfirmed,
      fabricUsedCm: r.fabricUsedCm,
      estimateCm: r.estimateCm,
      variancePercent: fabricVariancePercent(r.fabricUsedCm, r.estimateCm),
      wastageCm: r.wastageCm,
      liningUsedCm: r.liningUsedCm,
      pieces: r.pieces,
      notes: r.notes,
      photoUrl: r.photoPath ? await this.media.stagePhotoUrl(r.photoPath) : null,
      cutBy: r.cutBy,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
