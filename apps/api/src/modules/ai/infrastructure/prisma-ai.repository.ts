import { Injectable } from '@nestjs/common';
import type { AiImageKind, Prisma } from '@abaya/db';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { sanitizeTags, type SubjectKind } from '../domain/similarity';
import type {
  AiImageRecord,
  AiRepository,
  AnalysisResult,
  ClaimedImage,
  EnqueueImage,
  VectorRow,
} from '../application/ports/ai.ports';

/** How long a claimed image is hidden from other workers while it is analysed. */
const LEASE = '5 minutes';
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const clip = (s: string) => s.slice(0, 1000);

@Injectable()
export class PrismaAiRepository implements AiRepository {
  constructor(private readonly db: PrismaService) {}

  async enqueue(items: EnqueueImage[]): Promise<number> {
    const result = await this.db.aiImage.createMany({
      data: items.map((i) => ({
        kind: i.kind as AiImageKind,
        subjectId: i.subjectId,
        designId: i.designId,
        source: json(i.source),
      })),
      skipDuplicates: true, // (kind, subjectId) is unique
    });
    return result.count;
  }

  async remove(kind: SubjectKind, subjectIds: string[]): Promise<void> {
    await this.db.aiImage.deleteMany({ where: { kind, subjectId: { in: subjectIds } } });
  }

  async removeAllExcept(kind: SubjectKind, keepSubjectIds: string[]): Promise<number> {
    const result = await this.db.aiImage.deleteMany({ where: { kind, subjectId: { notIn: keepSubjectIds } } });
    return result.count;
  }

  async claimDue(limit: number): Promise<ClaimedImage[]> {
    // One statement, so it also works through the Supabase transaction pooler.
    return this.db.$queryRaw<ClaimedImage[]>`
      UPDATE "AiImage" a
      SET "nextAttemptAt" = now() + ${LEASE}::interval
      WHERE a.id IN (
        SELECT id FROM "AiImage"
        WHERE status = 'QUEUED' AND "nextAttemptAt" <= now()
        ORDER BY "nextAttemptAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING a.id, a.kind::text AS kind, a."subjectId", a.source, a.attempts`;
  }

  async saveResult(id: string, r: AnalysisResult): Promise<void> {
    await this.db.aiImage.updateMany({
      where: { id },
      data: {
        status: 'DONE',
        error: null,
        model: r.model,
        embedding: r.embedding,
        phash: r.phash,
        suggestedTags: json(sanitizeTags(r.tags)),
        suggestedStyle: r.style?.value ?? null,
        styleScore: r.style?.score ?? null,
        suggestedAltText: r.altText,
        suggestionStatus: 'PENDING',
        analysedAt: new Date(),
      },
    });
  }

  async markRetry(id: string, attempts: number, nextAttemptAt: Date, error: string): Promise<void> {
    await this.db.aiImage.updateMany({ where: { id }, data: { attempts, nextAttemptAt, error: clip(error) } });
  }

  async markFailed(id: string, attempts: number, error: string): Promise<void> {
    await this.db.aiImage.updateMany({ where: { id }, data: { status: 'FAILED', attempts, error: clip(error) } });
  }

  async release(ids: string[], nextAttemptAt: Date): Promise<void> {
    if (ids.length > 0) await this.db.aiImage.updateMany({ where: { id: { in: ids } }, data: { nextAttemptAt } });
  }

  async findBySubjects(kind: SubjectKind, subjectIds: string[]): Promise<AiImageRecord[]> {
    if (subjectIds.length === 0) return [];
    const rows = await this.db.aiImage.findMany({
      where: { kind, subjectId: { in: subjectIds } },
      select: {
        id: true,
        kind: true,
        subjectId: true,
        designId: true,
        status: true,
        error: true,
        suggestedTags: true,
        suggestedStyle: true,
        styleScore: true,
        suggestedAltText: true,
        suggestionStatus: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      subjectId: r.subjectId,
      designId: r.designId,
      status: r.status,
      error: r.error,
      tags: sanitizeTags(r.suggestedTags),
      style: r.suggestedStyle,
      styleScore: r.styleScore,
      altText: r.suggestedAltText,
      suggestionStatus: r.suggestionStatus,
    }));
  }

  async setSuggestionStatus(kind: SubjectKind, subjectIds: string[], status: 'APPLIED' | 'DISMISSED'): Promise<void> {
    await this.db.aiImage.updateMany({ where: { kind, subjectId: { in: subjectIds }, status: 'DONE' }, data: { suggestionStatus: status } });
  }

  async vectorVersion(): Promise<{ count: number; latest: Date | null }> {
    const agg = await this.db.aiImage.aggregate({ _count: { _all: true }, _max: { updatedAt: true } });
    return { count: agg._count._all, latest: agg._max.updatedAt };
  }

  async vectorsChangedSince(since: Date | null): Promise<VectorRow[]> {
    // `gte`, not `gt`: rows written in the same millisecond as the last look are read again (harmless).
    return this.db.aiImage.findMany({
      where: since ? { updatedAt: { gte: since } } : {},
      select: { id: true, kind: true, subjectId: true, designId: true, status: true, embedding: true, phash: true, updatedAt: true },
    });
  }

  async counts(): Promise<{ queued: number; done: number; failed: number }> {
    const rows = await this.db.aiImage.groupBy({ by: ['status'], _count: { _all: true } });
    const count = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    return { queued: count('QUEUED'), done: count('DONE'), failed: count('FAILED') };
  }

  async retryFailed(): Promise<number> {
    const r = await this.db.aiImage.updateMany({
      where: { status: 'FAILED' },
      data: { status: 'QUEUED', attempts: 0, nextAttemptAt: new Date(), error: null },
    });
    return r.count;
  }

  async requeueAll(): Promise<number> {
    const r = await this.db.aiImage.updateMany({ data: { status: 'QUEUED', attempts: 0, nextAttemptAt: new Date(), error: null } });
    return r.count;
  }
}
