import { Injectable } from '@nestjs/common';
import type { Prisma } from '@abaya/db';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { GenerationRecord, StudioRepository } from '../application/ports/studio.ports';

const include = { images: { orderBy: { sortOrder: 'asc' } } } satisfies Prisma.DesignGenerationInclude;
type Row = Prisma.DesignGenerationGetPayload<{ include: typeof include }>;

const toRecord = ({ leasedUntil: _l, images, options, ...g }: Row): GenerationRecord => ({
  ...g,
  options: (options ?? {}) as Record<string, string>,
  images: images.map(({ generationId: _g, createdAt: _c, ...i }) => i),
});

/** Queued now, waiting for a retry that is due, or abandoned by a worker that died. */
const due = (now: Date): Prisma.DesignGenerationWhereInput => ({
  OR: [
    { status: 'QUEUED', OR: [{ leasedUntil: null }, { leasedUntil: { lte: now } }] },
    { status: 'RUNNING', leasedUntil: { lte: now } },
  ],
});

@Injectable()
export class PrismaStudioRepository implements StudioRepository {
  constructor(private readonly db: PrismaService) {}

  create(input: Parameters<StudioRepository['create']>[0], audit: AuditEntry): Promise<GenerationRecord> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.designGeneration.create({ data: input, include });
      await writeAudit(tx, { ...audit, entityId: row.id });
      return toRecord(row);
    });
  }

  countSince(designerId: string, since: Date): Promise<number> {
    return this.db.designGeneration.count({ where: { designerId, createdAt: { gte: since } } });
  }

  async listForDesigner(designerId: string, limit: number): Promise<GenerationRecord[]> {
    const rows = await this.db.designGeneration.findMany({
      where: { designerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include,
    });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<GenerationRecord | null> {
    const row = await this.db.designGeneration.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  }

  async claimNext(now: Date, leaseMs: number): Promise<GenerationRecord | null> {
    // Pick a candidate, then take it with a conditional update: if another worker got there
    // first the update matches nothing and we try the next one.
    for (let tries = 0; tries < 5; tries++) {
      const candidate = await this.db.designGeneration.findFirst({
        where: due(now),
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!candidate) return null;
      const taken = await this.db.designGeneration.updateMany({
        where: { id: candidate.id, ...due(now) },
        data: { status: 'RUNNING', attempts: { increment: 1 }, leasedUntil: new Date(now.getTime() + leaseMs) },
      });
      if (taken.count === 1) return this.findById(candidate.id);
    }
    return null;
  }

  async complete(id: string, paths: string[]): Promise<void> {
    await this.db.$transaction([
      this.db.generatedImage.createMany({ data: paths.map((storagePath, sortOrder) => ({ generationId: id, storagePath, sortOrder })) }),
      this.db.designGeneration.update({
        where: { id },
        data: { status: 'DONE', error: null, leasedUntil: null, finishedAt: new Date() },
      }),
    ]);
  }

  async fail(id: string, error: string, retryAt: Date | null): Promise<void> {
    await this.db.designGeneration.update({
      where: { id },
      data: retryAt
        ? { status: 'QUEUED', error: error.slice(0, 500), leasedUntil: retryAt }
        : { status: 'FAILED', error: error.slice(0, 500), leasedUntil: null, finishedAt: new Date() },
    });
  }

  async findImage(imageId: string) {
    const row = await this.db.generatedImage.findUnique({ where: { id: imageId }, include: { generation: { include } } });
    if (!row) return null;
    const { generation, generationId: _g, createdAt: _c, ...image } = row;
    return { image, generation: toRecord(generation) };
  }

  async setFavourite(imageId: string, favourite: boolean): Promise<void> {
    await this.db.generatedImage.update({ where: { id: imageId }, data: { favourite } });
  }

  async linkDesign(imageId: string, designId: string): Promise<void> {
    await this.db.generatedImage.update({ where: { id: imageId }, data: { designId } });
  }
}
