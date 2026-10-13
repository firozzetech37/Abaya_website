import { Injectable } from '@nestjs/common';
import type { Prisma } from '@abaya/db';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { pageArgs, toPage } from '../../../common/pagination';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CatalogImageRecord,
  CatalogJobRecord,
  CatalogModelProfileRecord,
  CatalogPromptPresetRecord,
  CatalogRepository,
  NewCatalogJob,
  StudioUsageRow,
} from '../application/ports/catalog.ports';

const include = { images: { orderBy: { sortOrder: 'asc' } } } satisfies Prisma.CatalogJobInclude;
type JobRow = Prisma.CatalogJobGetPayload<{ include: typeof include }>;
type ImageRow = JobRow['images'][number];

const toImage = (i: ImageRow): CatalogImageRecord => ({
  id: i.id,
  jobId: i.jobId,
  storagePath: i.storagePath,
  sortOrder: i.sortOrder,
  review: i.review,
  reasons: i.reasons,
  scores: (i.scores as Record<string, number> | null) ?? null,
  note: i.note,
  designId: i.designId,
});

const toJob = ({ images, nextCheckAt: _n, ...j }: JobRow): CatalogJobRecord => ({
  ...j,
  view: j.view as CatalogJobRecord['view'],
  resolution: j.resolution as CatalogJobRecord['resolution'],
  mode: j.mode as CatalogJobRecord['mode'],
  inputs: j.inputs as CatalogJobRecord['inputs'],
  images: images.map(toImage),
});

const profileInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CatalogModelProfileInclude;
type ProfileRow = Prisma.CatalogModelProfileGetPayload<{ include: typeof profileInclude }>;
const toProfile = (p: ProfileRow, abayaCount = 0): CatalogModelProfileRecord => ({
  id: p.id,
  name: p.name,
  type: p.type,
  imagePath: p.imagePath,
  description: p.description,
  createdBy: p.createdBy,
  archivedAt: p.archivedAt,
  createdAt: p.createdAt,
  abayaCount,
});

const presetInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CatalogPromptPresetInclude;
type PresetRow = Prisma.CatalogPromptPresetGetPayload<{ include: typeof presetInclude }>;
const toPreset = (p: PresetRow): CatalogPromptPresetRecord => ({
  id: p.id,
  name: p.name,
  text: p.text,
  createdBy: p.createdBy,
  archivedAt: p.archivedAt,
  createdAt: p.createdAt,
});

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

@Injectable()
export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly db: PrismaService) {}

  createJobs(jobs: NewCatalogJob[], audit: AuditEntry): Promise<CatalogJobRecord[]> {
    return this.db.$transaction(async (tx) => {
      const created: CatalogJobRecord[] = [];
      for (const { afterPrevious, afterIndex, ...j } of jobs) {
        const afterJobId =
          afterIndex !== undefined ? (created[afterIndex]?.id ?? null) : afterPrevious ? (created[created.length - 1]?.id ?? null) : null;
        const row = await tx.catalogJob.create({
          data: { ...j, designId: j.designId ?? null, afterJobId, inputs: json(j.inputs) },
          include,
        });
        created.push(toJob(row));
      }
      await writeAudit(tx, {
        ...audit,
        entityId: created[0]?.id ?? audit.entityId,
        after: { ...(audit.after as object), jobIds: created.map((c) => c.id) },
      });
      return created;
    });
  }

  async findJob(id: string) {
    const row = await this.db.catalogJob.findUnique({ where: { id }, include });
    return row ? toJob(row) : null;
  }

  async listJobs(query: {
    createdById?: string;
    designId?: string;
    limit: number;
    cursor?: string;
    activeOnly?: boolean;
  }) {
    const rows = await this.db.catalogJob.findMany({
      where: {
        ...(query.createdById ? { createdById: query.createdById } : {}),
        ...(query.designId ? { designId: query.designId } : {}),
        ...(query.activeOnly ? { status: { in: ['QUEUED', 'RUNNING'] } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include,
      ...pageArgs(query.cursor, query.limit),
    });
    return toPage(rows, query.limit, toJob);
  }

  async findImage(id: string) {
    const row = await this.db.catalogImage.findUnique({
      where: { id },
      include: { job: { include } },
    });
    if (!row) return null;
    const { job, ...image } = row;
    return { image: toImage(image), job: toJob(job) };
  }

  async creditsSince(createdById: string, since: Date) {
    const r = await this.db.catalogJob.aggregate({
      where: { createdById, createdAt: { gte: since }, status: { not: 'FAILED' } },
      _sum: { creditsEstimated: true },
    });
    return r._sum.creditsEstimated ?? 0;
  }

  async usageByCreator(since: Date, until: Date): Promise<StudioUsageRow[]> {
    const inRange = { createdAt: { gte: since, lt: until } };
    const [all, reported, estimated, failed, remakes] = await Promise.all([
      this.db.catalogJob.groupBy({ by: ['createdById'], where: inRange, _count: { _all: true }, _max: { createdAt: true } }),
      // FASHN's own count when it gave one, else the estimate; failed jobs cost nothing.
      this.db.catalogJob.groupBy({
        by: ['createdById'],
        where: { ...inRange, status: { not: 'FAILED' }, creditsUsed: { not: null } },
        _sum: { creditsUsed: true },
      }),
      this.db.catalogJob.groupBy({
        by: ['createdById'],
        where: { ...inRange, status: { not: 'FAILED' }, creditsUsed: null },
        _sum: { creditsEstimated: true },
      }),
      this.db.catalogJob.groupBy({ by: ['createdById'], where: { ...inRange, status: 'FAILED' }, _count: { _all: true } }),
      this.db.catalogJob.groupBy({ by: ['createdById'], where: { ...inRange, retryOfImageId: { not: null } }, _count: { _all: true } }),
    ]);
    const sum = <T extends { createdById: string }>(rows: T[], pick: (r: T) => number) =>
      new Map(rows.map((r) => [r.createdById, pick(r)]));
    const used = sum(reported, (r) => r._sum.creditsUsed ?? 0);
    const guessed = sum(estimated, (r) => r._sum.creditsEstimated ?? 0);
    const failures = sum(failed, (r) => r._count._all);
    const retries = sum(remakes, (r) => r._count._all);
    return all.map((g) => ({
      userId: g.createdById,
      jobs: g._count._all,
      failed: failures.get(g.createdById) ?? 0,
      remakes: retries.get(g.createdById) ?? 0,
      credits: (used.get(g.createdById) ?? 0) + (guessed.get(g.createdById) ?? 0),
      lastUsedAt: g._max.createdAt ?? since,
    }));
  }

  async listJobsByCreator(createdById: string, since: Date, until: Date, limit: number) {
    const rows = await this.db.catalogJob.findMany({
      where: { createdById, createdAt: { gte: since, lt: until } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include,
      take: limit,
    });
    return rows.map(toJob);
  }

  countRunning() {
    return this.db.catalogJob.count({ where: { status: 'RUNNING' } });
  }

  async claimDue(status: 'QUEUED' | 'RUNNING', now: Date, leaseUntil: Date, limit: number) {
    const claimed: CatalogJobRecord[] = [];
    if (limit <= 0) return claimed;
    const candidates = await this.db.catalogJob.findMany({
      where: {
        status,
        nextCheckAt: { lte: now },
        // A chained job waits until the job before it has finished.
        ...(status === 'QUEUED'
          ? { OR: [{ afterJobId: null }, { afterJob: { status: { in: ['DONE', 'FAILED'] } } }] }
          : {}),
      },
      orderBy: { nextCheckAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    for (const c of candidates) {
      // Conditional update: another worker that took it first makes this match nothing.
      const taken = await this.db.catalogJob.updateMany({
        where: { id: c.id, status, nextCheckAt: { lte: now } },
        data: { nextCheckAt: leaseUntil },
      });
      if (taken.count === 1) {
        const job = await this.findJob(c.id);
        if (job) claimed.push(job);
      }
    }
    return claimed;
  }

  async markSubmitted(id: string, providerJobId: string, at: Date, nextCheckAt: Date) {
    await this.db.catalogJob.update({
      where: { id },
      data: {
        status: 'RUNNING',
        providerJobId,
        submittedAt: at,
        nextCheckAt,
        attempts: { increment: 1 },
        error: null,
      },
    });
  }

  async reschedule(
    id: string,
    nextCheckAt: Date,
    patch: { requeue?: boolean; error?: string; countAttempt?: boolean } = {},
  ) {
    await this.db.catalogJob.update({
      where: { id },
      data: {
        nextCheckAt,
        ...(patch.requeue ? { status: 'QUEUED', providerJobId: null, submittedAt: null } : {}),
        ...(patch.error !== undefined ? { error: patch.error.slice(0, 500) } : {}),
        ...(patch.countAttempt ? { attempts: { increment: 1 } } : {}),
      },
    });
  }

  async complete(id: string, paths: string[], creditsUsed: number | null) {
    await this.db.$transaction([
      this.db.catalogImage.createMany({
        data: paths.map((storagePath, sortOrder) => ({ jobId: id, storagePath, sortOrder })),
      }),
      this.db.catalogJob.update({
        where: { id },
        data: { status: 'DONE', creditsUsed, error: null, finishedAt: new Date() },
      }),
    ]);
  }

  async startFrom(id: string, image: { id: string; storagePath: string }) {
    const job = await this.db.catalogJob.findUniqueOrThrow({
      where: { id },
      select: { inputs: true },
    });
    await this.db.catalogJob.update({
      where: { id },
      data: {
        parentImageId: image.id,
        inputs: json({ ...(job.inputs as object), sourcePath: image.storagePath }),
      },
    });
  }

  async fail(id: string, error: string) {
    await this.db.catalogJob.update({
      where: { id },
      data: { status: 'FAILED', error: error.slice(0, 500), finishedAt: new Date() },
    });
  }

  reviewImage(
    id: string,
    data: {
      review: 'PENDING' | 'APPROVED' | 'REJECTED';
      reasons: string[];
      scores: Record<string, number> | null;
      note: string | null;
      reviewedById: string;
    },
    audit: AuditEntry,
  ): Promise<void> {
    return this.db.$transaction(async (tx) => {
      await tx.catalogImage.update({
        where: { id },
        data: {
          ...data,
          scores: data.scores ? json(data.scores) : undefined,
          reviewedAt: new Date(),
        },
      });
      await writeAudit(tx, audit);
    });
  }

  async linkDesign(imageId: string, designId: string) {
    await this.db.catalogImage.update({ where: { id: imageId }, data: { designId } });
  }

  createProfile(
    data: Parameters<CatalogRepository['createProfile']>[0],
    audit: AuditEntry,
  ): Promise<CatalogModelProfileRecord> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.catalogModelProfile.create({
        data: { ...data, attributes: data.attributes ? json(data.attributes) : undefined },
        include: profileInclude,
      });
      await writeAudit(tx, { ...audit, entityId: row.id });
      return toProfile(row, 0);
    });
  }

  countProfiles() {
    return this.db.catalogModelProfile.count();
  }

  async listProfiles() {
    const rows = await this.db.catalogModelProfile.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'desc' },
      include: profileInclude,
    });
    // Different abaya photos each model has worn in a master (each abaya should get a new face).
    const masters = await this.db.catalogJob.findMany({
      where: { view: 'MASTER', modelProfileId: { in: rows.map((r) => r.id) } },
      select: { modelProfileId: true, inputs: true },
    });
    const worn = new Map<string, Set<string>>();
    for (const m of masters) {
      const abaya = (m.inputs as { abayaPath?: string }).abayaPath;
      if (!m.modelProfileId || !abaya) continue;
      worn.set(m.modelProfileId, (worn.get(m.modelProfileId) ?? new Set()).add(abaya));
    }
    return rows.map((r) => toProfile(r, worn.get(r.id)?.size ?? 0));
  }

  async findProfile(id: string) {
    const row = await this.db.catalogModelProfile.findUnique({
      where: { id },
      include: profileInclude,
    });
    return row ? toProfile(row) : null;
  }

  async createPreset(data: { name: string; text: string; createdById: string }) {
    return toPreset(await this.db.catalogPromptPreset.create({ data, include: presetInclude }));
  }

  async listPresets() {
    const rows = await this.db.catalogPromptPreset.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'desc' },
      include: presetInclude,
    });
    return rows.map(toPreset);
  }

  async findPreset(id: string) {
    const row = await this.db.catalogPromptPreset.findUnique({
      where: { id },
      include: presetInclude,
    });
    return row ? toPreset(row) : null;
  }

  async archivePreset(id: string) {
    await this.db.catalogPromptPreset.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async archiveProfile(id: string) {
    await this.db.catalogModelProfile.update({ where: { id }, data: { archivedAt: new Date() } });
  }
}
