import { Injectable } from '@nestjs/common';
import type { Prisma, ReferenceStatus } from '@abaya/db';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { pageArgs, toPage } from '../../../common/pagination';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CollectionInput,
  CollectionRecord,
  CollectionRepository,
  ReferenceRecord,
  ReferenceRepository,
} from '../application/ports/catalog.ports';

const collectionInclude = {
  _count: { select: { designs: true } },
  designs: { select: { id: true } },
} satisfies Prisma.CollectionInclude;

@Injectable()
export class PrismaCollectionRepository implements CollectionRepository {
  constructor(private readonly db: PrismaService) {}

  private async withCounts(
    rows: Prisma.CollectionGetPayload<{ include: typeof collectionInclude }>[],
  ): Promise<CollectionRecord[]> {
    const published = await this.db.collection.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true, _count: { select: { designs: { where: { status: 'PUBLISHED' } } } } },
    });
    const publishedById = new Map(published.map((p) => [p.id, p._count.designs]));
    // The cover: the primary photo of the newest published design in each collection.
    const covers = await this.db.design.findMany({
      where: { status: 'PUBLISHED', collections: { some: { id: { in: rows.map((r) => r.id) } } } },
      orderBy: { publishedAt: 'desc' },
      select: {
        collections: { select: { id: true } },
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { storagePath: true, previewVersion: true } },
      },
    });
    const previewsById = new Map<string, CollectionRecord['previews']>();
    for (const d of covers) {
      const image = d.images[0];
      if (!image) continue;
      for (const c of d.collections) {
        const list = previewsById.get(c.id) ?? [];
        if (list.length < 3) previewsById.set(c.id, [...list, image]);
      }
    }
    return rows.map(({ _count, designs, createdAt: _c, updatedAt: _u, ...c }) => ({
      ...c,
      designIds: designs.map((d) => d.id),
      designCount: _count.designs,
      publishedDesignCount: publishedById.get(c.id) ?? 0,
      cover: previewsById.get(c.id)?.[0] ?? null,
      previews: previewsById.get(c.id) ?? [],
    }));
  }

  async list(onlyActive: boolean) {
    const rows = await this.db.collection.findMany({
      where: onlyActive ? { isActive: true } : {},
      include: collectionInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return this.withCounts(rows);
  }

  async findBySlug(slug: string) {
    const row = await this.db.collection.findUnique({ where: { slug }, include: collectionInclude });
    return row ? (await this.withCounts([row]))[0]! : null;
  }

  async findById(id: string) {
    const row = await this.db.collection.findUnique({ where: { id }, include: collectionInclude });
    return row ? (await this.withCounts([row]))[0]! : null;
  }

  async create(input: CollectionInput & { slug: string; name: string }) {
    const { designIds, ...data } = input;
    const row = await this.db.collection.create({
      data: { ...data, ...(designIds ? { designs: { connect: designIds.map((id) => ({ id })) } } : {}) },
      include: collectionInclude,
    });
    return (await this.withCounts([row]))[0]!;
  }

  async update(id: string, input: CollectionInput) {
    const { designIds, ...data } = input;
    const row = await this.db.collection.update({
      where: { id },
      data: { ...data, ...(designIds ? { designs: { set: designIds.map((d) => ({ id: d })) } } : {}) },
      include: collectionInclude,
    });
    return (await this.withCounts([row]))[0]!;
  }
}

const referenceInclude = {
  assignedDesigner: { select: { id: true, name: true, email: true } },
  designs: { select: { id: true } },
} satisfies Prisma.ReferenceInclude;

type ReferenceRow = Prisma.ReferenceGetPayload<{ include: typeof referenceInclude }>;

const toReference = ({ designs, assignedDesignerId: _a, importJobId: _j, updatedAt: _u, ...r }: ReferenceRow): ReferenceRecord => ({
  ...r,
  designIds: designs.map((d) => d.id),
});

@Injectable()
export class PrismaReferenceRepository implements ReferenceRepository {
  constructor(private readonly db: PrismaService) {}

  async findById(id: string) {
    const row = await this.db.reference.findUnique({ where: { id }, include: referenceInclude });
    return row ? toReference(row) : null;
  }

  async findManyByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db.reference.findMany({ where: { id: { in: ids } }, include: referenceInclude });
    return rows.map(toReference);
  }

  listAllImages() {
    // Pinterest pins are looked at only: their images are never fetched for AI analysis.
    return this.db.reference.findMany({ where: { source: { not: 'PINTEREST' } }, select: { id: true, imagePath: true } });
  }

  async savePin(input: { pinId: string; url: string; imageUrl: string; title: string | null; note: string | null; designerId: string }) {
    const data = {
      sourceUrl: input.url,
      imagePath: input.imageUrl,
      title: input.title,
      licenseNote: 'Pinterest pin: inspiration only. Shown from Pinterest with a link back; never copied or used as a product.',
      ...(input.note ? { reviewNotes: input.note } : {}),
      assignedDesignerId: input.designerId,
    };
    const row = await this.db.reference.upsert({
      where: { source_externalId: { source: 'PINTEREST', externalId: input.pinId } },
      create: { ...data, source: 'PINTEREST', externalId: input.pinId, status: 'NEEDS_DESIGN', tags: [] },
      update: data,
      include: referenceInclude,
    });
    return toReference(row);
  }

  async list(query: { status?: ReferenceStatus; assignedDesignerId?: string; cursor?: string; limit: number }) {
    const rows = await this.db.reference.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.assignedDesignerId ? { assignedDesignerId: query.assignedDesignerId } : {}),
      },
      include: referenceInclude,
      orderBy: [{ importedAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(query.cursor, query.limit),
    });
    return toPage(rows, query.limit, toReference);
  }

  async createManual(input: { imagePath: string; title?: string; sourceUrl?: string; licenseNote?: string; tags: string[] }) {
    const row = await this.db.reference.create({
      data: { ...input, source: 'MANUAL_UPLOAD' },
      include: referenceInclude,
    });
    return toReference(row);
  }

  update(
    id: string,
    patch: {
      title?: string;
      tags?: string[];
      licenseNote?: string;
      status?: ReferenceStatus;
      reviewNotes?: string;
      assignedDesignerId?: string | null;
    },
    audit: AuditEntry,
  ): Promise<ReferenceRecord> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.reference.update({ where: { id }, data: patch, include: referenceInclude });
      await writeAudit(tx, audit);
      return toReference(row);
    });
  }
}
