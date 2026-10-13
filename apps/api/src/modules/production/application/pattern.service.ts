import { Inject, Injectable } from '@nestjs/common';
import type { PatternBody, PatternDto } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { ORDER_MEDIA, type OrderMedia } from '../../orders/application/ports/orders.ports';
import { assertReadyForCutting, withFinished } from '../domain/pattern.rules';
import { type PatternRecord, PRODUCTION_REPOSITORY, type ProductionRepository } from './ports/production.ports';

/** Versioned patterns per item (Pattern station). File links are short-lived signed URLs. */
@Injectable()
export class PatternService {
  constructor(
    @Inject(PRODUCTION_REPOSITORY) private readonly repo: ProductionRepository,
    @Inject(ORDER_MEDIA) private readonly media: OrderMedia,
  ) {}

  list(itemId: string): Promise<PatternRecord[]> {
    return this.repo.listPatterns(itemId);
  }

  saveDraft(itemId: string, content: PatternBody, actor: Actor): Promise<PatternRecord> {
    return this.repo.savePatternDraft(itemId, content, actor.userId);
  }

  /**
   * Pattern → cutting: the latest version must be complete. A draft is confirmed now
   * (audited); an already-confirmed version (e.g. reused after a QC send-back) is kept.
   */
  async confirmForCutting(actor: Actor, itemId: string): Promise<void> {
    const latest = (await this.repo.listPatterns(itemId))[0] ?? null;
    assertReadyForCutting(latest?.content ?? null);
    if (latest!.status === 'CONFIRMED') return;
    await this.repo.confirmPattern(latest!.id, actor.userId, {
      actorUserId: actor.userId,
      action: 'pattern.confirmed',
      entityType: 'OrderItem',
      entityId: itemId,
      after: { version: latest!.version, fabricLengthCm: latest!.content.fabricLengthCm, files: latest!.content.files.length },
      ip: actor.ip,
    });
  }

  /** Latest version per item, for the admin order page. */
  async latest(itemIds: string[]): Promise<Map<string, PatternDto>> {
    const records = await this.repo.latestPatterns(itemIds);
    const out = new Map<string, PatternDto>();
    for (const [id, r] of records) out.set(id, await this.toDto(r));
    return out;
  }

  async toDto(r: PatternRecord): Promise<PatternDto> {
    return {
      id: r.id,
      version: r.version,
      status: r.status,
      measurements: withFinished(r.content.measurements),
      pieces: r.content.pieces,
      fabricWidthCm: r.content.fabricWidthCm,
      fabricLengthCm: r.content.fabricLengthCm,
      liningLengthCm: r.content.liningLengthCm,
      seamAllowanceMm: r.content.seamAllowanceMm,
      notes: r.content.notes,
      files: await Promise.all(r.content.files.map(async (f) => ({ ...f, url: await this.media.stagePhotoUrl(f.path) }))),
      createdBy: r.createdBy,
      confirmedBy: r.confirmedBy,
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
