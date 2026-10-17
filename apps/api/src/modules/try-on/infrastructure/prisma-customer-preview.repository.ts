import { Injectable } from '@nestjs/common';
import { Prisma } from '@abaya/db';
import type { CustomerPreviewKind } from '@abaya/contracts';
import { pageArgs, toPage } from '../../../common/pagination';
import { MODEL_TRYON_LINE } from '../domain/try-on.rules';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CustomerPreviewRecord,
  CustomerPreviewRepository,
  CustomerUsageRow,
  NewCustomerPreview,
} from '../application/ports/try-on.ports';

/** "A model like me" try-ons (no photo of her): kept and listed for the admin like previews. */
const KEPT_TRYON = { kind: 'TRYON', personPath: null, choices: { has: MODEL_TRYON_LINE } } satisfies Prisma.CustomerPreviewWhereInput;

@Injectable()
export class PrismaCustomerPreviewRepository implements CustomerPreviewRepository {
  constructor(private readonly db: PrismaService) {}

  create({ checks, ...input }: NewCustomerPreview): Promise<CustomerPreviewRecord> {
    return this.db.customerPreview.create({ data: { ...input, checks: checks ?? Prisma.JsonNull } });
  }

  findById(id: string) {
    return this.db.customerPreview.findUnique({ where: { id } });
  }

  async grantAccess(previewId: string, userId: string, at: Date, expiresAt: Date) {
    await this.db.customerPreviewAccess.upsert({
      where: { previewId_userId: { previewId, userId } },
      create: { previewId, userId, receivedAt: at, expiresAt },
      update: { receivedAt: at, expiresAt },
    });
  }

  async accessUntil(previewId: string, userId: string, now: Date) {
    const row = await this.db.customerPreviewAccess.findUnique({ where: { previewId_userId: { previewId, userId } } });
    return row && row.expiresAt > now ? row.expiresAt : null;
  }

  async listRecent(userId: string, designId: string, now: Date, limit: number) {
    const rows = await this.db.customerPreviewAccess.findMany({
      where: { userId, expiresAt: { gt: now }, preview: { designId, purgedAt: null } },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      include: { preview: true },
      take: limit,
    });
    return rows.map((a) => ({ row: a.preview, expiresAt: a.expiresAt }));
  }

  async listMine(userId: string, now: Date, limit: number) {
    const rows = await this.db.customerPreviewAccess.findMany({
      where: { userId, expiresAt: { gt: now }, preview: { purgedAt: null, hidden: false } },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      include: { preview: true },
      take: limit,
    });
    return rows.map((a) => ({ row: a.preview, expiresAt: a.expiresAt }));
  }

  listUnclaimed(now: Date, madeBefore: { photoTryOns: Date; keptForAdmin: Date }, limit: number) {
    return this.db.customerPreview.findMany({
      where: {
        purgedAt: null,
        status: { in: ['DONE', 'FAILED'] },
        OR: [
          { kind: 'TRYON', NOT: KEPT_TRYON, createdAt: { lt: madeBefore.photoTryOns } },
          { OR: [{ kind: 'PREVIEW' }, KEPT_TRYON], createdAt: { lt: madeBefore.keptForAdmin } },
        ],
        access: { none: { expiresAt: { gt: now } } },
      },
      take: limit,
    });
  }

  async markPurged(id: string, at: Date) {
    await this.db.customerPreview.update({
      where: { id },
      // Her prompts may describe her build: they go with the pictures.
      data: { purgedAt: at, resultPath: null, workingPath: null, personPath: null, prompt: '', steps: [] },
    });
  }

  async findByIdPrefix(prefix: string) {
    if (!/^[0-9a-f]{8}$/.test(prefix)) return null;
    const rows = await this.db.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "CustomerPreview" WHERE "id"::text LIKE ${`${prefix}-%`} LIMIT 2`;
    return rows.length === 1 ? this.db.customerPreview.findUnique({ where: { id: rows[0]!.id } }) : null;
  }

  findShared(previewKey: string) {
    return this.db.customerPreview.findFirst({
      // A combination that could not be made accurately is remembered too (no new attempts).
      where: { previewKey, kind: 'PREVIEW', hidden: false, purgedAt: null, OR: [{ status: { not: 'FAILED' } }, { inaccurate: true }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  countByUserSince(userId: string, kind: CustomerPreviewKind, since: Date) {
    return this.db.customerPreview.count({ where: { userId, kind, createdAt: { gte: since }, status: { not: 'FAILED' } } });
  }

  countSince(kind: CustomerPreviewKind, since: Date) {
    return this.db.customerPreview.count({ where: { kind, createdAt: { gte: since }, status: { not: 'FAILED' } } });
  }

  async creditsSince(since: Date) {
    const sum = await this.db.customerPreview.aggregate({
      // Inaccurate previews did use credits.
      where: { createdAt: { gte: since }, OR: [{ status: { not: 'FAILED' } }, { inaccurate: true }] },
      _sum: { credits: true },
    });
    return sum._sum.credits ?? 0;
  }

  async claimDue(status: 'QUEUED' | 'RUNNING', now: Date, leaseUntil: Date, limit: number) {
    const claimed: CustomerPreviewRecord[] = [];
    if (limit <= 0) return claimed;
    const candidates = await this.db.customerPreview.findMany({
      where: { status, nextCheckAt: { lte: now } },
      orderBy: { nextCheckAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    for (const c of candidates) {
      // Conditional update: a worker that took it first makes this match nothing.
      const taken = await this.db.customerPreview.updateMany({
        where: { id: c.id, status, nextCheckAt: { lte: now } },
        data: { nextCheckAt: leaseUntil },
      });
      if (taken.count === 1) {
        const row = await this.findById(c.id);
        if (row) claimed.push(row);
      }
    }
    return claimed;
  }

  countRunning() {
    return this.db.customerPreview.count({ where: { status: 'RUNNING' } });
  }

  async markSubmitted(id: string, providerJobId: string, now: Date, nextCheckAt: Date) {
    await this.db.customerPreview.update({
      where: { id },
      data: { status: 'RUNNING', providerJobId, submittedAt: now, nextCheckAt, attempts: { increment: 1 } },
    });
  }

  async reschedule(id: string, nextCheckAt: Date, opts: { requeue?: boolean; countAttempt?: boolean; error?: string } = {}) {
    await this.db.customerPreview.update({
      where: { id },
      data: {
        nextCheckAt,
        ...(opts.requeue ? { status: 'QUEUED', providerJobId: null, submittedAt: null } : {}),
        ...(opts.countAttempt ? { attempts: { increment: 1 } } : {}),
        ...(opts.error ? { error: opts.error } : {}),
      },
    });
  }

  async nextStep(id: string, workingPath: string, step: number, refund = 0) {
    await this.db.customerPreview.update({
      where: { id },
      data: {
        status: 'QUEUED',
        step,
        workingPath,
        providerJobId: null,
        submittedAt: null,
        attempts: 0,
        nextCheckAt: new Date(0),
        ...(refund > 0 ? { credits: { decrement: refund } } : {}),
      },
    });
  }

  async restart(id: string, steps: string[], credits: number, checkNotes: string, opts: { keepResult?: boolean } = {}) {
    // updateMany: she may have deleted it meanwhile.
    await this.db.customerPreview.updateMany({
      where: { id },
      data: {
        status: 'QUEUED',
        steps,
        step: 0,
        workingPath: null,
        ...(opts.keepResult ? {} : { resultPath: null }),
        providerJobId: null,
        submittedAt: null,
        attempts: 0,
        retries: { increment: 1 },
        credits: { increment: credits },
        checkNotes,
        nextCheckAt: new Date(0),
      },
    });
  }

  async complete(id: string, resultPath: string, now: Date, checkNotes?: string) {
    await this.db.customerPreview.update({
      where: { id },
      data: { status: 'DONE', resultPath, finishedAt: now, error: null, ...(checkNotes ? { checkNotes } : {}) },
    });
  }

  async replaceResult(id: string, resultPath: string, checkNotes: string) {
    await this.db.customerPreview.updateMany({ where: { id }, data: { status: 'DONE', resultPath, error: null, checkNotes } });
  }

  async settle(id: string, checkNotes: string) {
    await this.db.customerPreview.updateMany({ where: { id }, data: { status: 'DONE', error: null, checkNotes } });
  }

  async failInaccurate(id: string, error: string, checkNotes: string, now: Date) {
    await this.db.customerPreview.update({
      where: { id },
      data: { status: 'FAILED', inaccurate: true, error, checkNotes, finishedAt: now },
    });
  }

  async fail(id: string, error: string, now: Date) {
    await this.db.customerPreview.update({ where: { id }, data: { status: 'FAILED', error, finishedAt: now } });
  }

  async setHidden(id: string, hidden: boolean) {
    return this.db.customerPreview.update({ where: { id }, data: { hidden } });
  }

  async delete(id: string) {
    await this.db.customerPreview.deleteMany({ where: { id } });
  }

  listExpired(now: Date, limit: number) {
    return this.db.customerPreview.findMany({ where: { kind: 'TRYON', expiresAt: { lte: now } }, take: limit });
  }

  async listPreviews(query: { cursor?: string; limit: number; userId?: string }) {
    const rows = await this.db.customerPreview.findMany({
      where: { OR: [{ kind: 'PREVIEW' }, KEPT_TRYON], ...(query.userId ? { userId: query.userId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(query.cursor, query.limit),
    });
    return toPage(rows, query.limit, (r) => r);
  }

  async usageByUser(since: Date, until: Date): Promise<CustomerUsageRow[]> {
    const inRange = { createdAt: { gte: since, lt: until } };
    const [byKind, spent, failed] = await Promise.all([
      this.db.customerPreview.groupBy({
        by: ['userId', 'kind'],
        where: inRange,
        _count: { _all: true },
        _sum: { retries: true },
        _max: { createdAt: true },
      }),
      // Same rule as the daily limit: failed requests cost nothing, except inaccurate previews.
      this.db.customerPreview.groupBy({
        by: ['userId'],
        where: { ...inRange, OR: [{ status: { not: 'FAILED' } }, { inaccurate: true }] },
        _sum: { credits: true },
      }),
      this.db.customerPreview.groupBy({ by: ['userId'], where: { ...inRange, status: 'FAILED' }, _count: { _all: true } }),
    ]);
    const rows = new Map<string, CustomerUsageRow>();
    for (const g of byKind) {
      const row = rows.get(g.userId) ?? { userId: g.userId, previews: 0, tryOns: 0, failed: 0, remakes: 0, credits: 0, lastUsedAt: new Date(0) };
      if (g.kind === 'PREVIEW') row.previews += g._count._all;
      else row.tryOns += g._count._all;
      row.remakes += g._sum.retries ?? 0;
      if (g._max.createdAt && g._max.createdAt > row.lastUsedAt) row.lastUsedAt = g._max.createdAt;
      rows.set(g.userId, row);
    }
    for (const g of spent) {
      const row = rows.get(g.userId);
      if (row) row.credits = g._sum.credits ?? 0;
    }
    for (const g of failed) {
      const row = rows.get(g.userId);
      if (row) row.failed = g._count._all;
    }
    return [...rows.values()];
  }

  listByUser(userId: string, since: Date, until: Date, limit: number) {
    return this.db.customerPreview.findMany({
      where: { userId, createdAt: { gte: since, lt: until } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
}
