import { Injectable } from '@nestjs/common';
import type { Prisma } from '@abaya/db';
import type { DesignFacetsQuery, DesignStatus, ListAdminDesignsQuery, ListDesignsQuery } from '@abaya/contracts';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { pageArgs, toPage } from '../../../common/pagination';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  DesignFacetsRecord,
  DesignImageRecord,
  DesignOptionRecord,
  DesignPatch,
  DesignRecord,
  DesignRepository,
  DesignStatusChange,
  NewDesign,
} from '../application/ports/catalog.ports';

const include = {
  designer: { select: { id: true, name: true, email: true } },
  images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  options: { select: { optionValueId: true, surchargeOverrideInPaise: true, isDefault: true } },
  collections: { select: { id: true, name: true, isActive: true, sortOrder: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
} satisfies Prisma.DesignInclude;

type Row = Prisma.DesignGetPayload<{ include: typeof include }>;

const toRecord = ({ collections, images, ...d }: Row): DesignRecord => ({
  ...d,
  images: images.map(({ designId: _d, createdAt: _c, ...i }): DesignImageRecord => i),
  collectionIds: collections.map((c) => c.id),
  collections,
});

/**
 * Published designs matching the storefront filters. `colourValueIds`: designs offering any of
 * these colours (undefined: no colour filter; empty: the colour is unknown, so nothing matches).
 */
function publishedWhere(query: DesignFacetsQuery, colourValueIds: string[] | undefined): Prisma.DesignWhereInput {
  return {
    status: 'PUBLISHED',
    ...(query.style ? { style: query.style } : {}),
    ...(query.collection ? { collections: { some: { slug: query.collection, isActive: true } } } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
            { tags: { has: query.q.toLowerCase() } },
          ],
        }
      : {}),
    ...(colourValueIds !== undefined ? { options: { some: { optionValueId: { in: colourValueIds } } } } : {}),
    ...(query.minPriceInPaise !== undefined || query.maxPriceInPaise !== undefined
      ? { basePriceInPaise: { gte: query.minPriceInPaise, lte: query.maxPriceInPaise } }
      : {}),
  };
}

@Injectable()
export class PrismaDesignRepository implements DesignRepository {
  constructor(private readonly db: PrismaService) {}

  async bumpPreviewVersions(storagePaths: string[], generation: number) {
    if (storagePaths.length === 0) return;
    await this.db.designImage.updateMany({
      where: { storagePath: { in: storagePaths } },
      data: { previewVersion: { increment: 1 }, previewGeneration: generation },
    });
  }

  async listStalePreviewPaths(limit: number, generation: number) {
    const rows = await this.db.designImage.findMany({
      where: { previewGeneration: { lt: generation }, design: { status: { in: ['PUBLISHED', 'ARCHIVED'] } } },
      select: { storagePath: true, designId: true },
      take: limit,
    });
    return rows.map((r) => ({ designId: r.designId, path: r.storagePath }));
  }

  async listPublicImagePaths() {
    const rows = await this.db.design.findMany({
      where: { status: { in: ['PUBLISHED', 'ARCHIVED'] } },
      select: { id: true, images: { select: { storagePath: true } } },
    });
    return rows.map((r) => ({ designId: r.id, paths: r.images.map((i) => i.storagePath) }));
  }

  async findIdByPrefix(prefix: string) {
    if (!/^[0-9a-f]{8}$/.test(prefix)) return null;
    const rows = await this.db.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "Design" WHERE "id"::text LIKE ${`${prefix}-%`} LIMIT 2`;
    return rows.length === 1 ? rows[0]!.id : null;
  }

  async findById(id: string) {
    const row = await this.db.design.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  }

  async findBySlug(slug: string) {
    const row = await this.db.design.findUnique({ where: { slug }, include });
    return row ? toRecord(row) : null;
  }

  async findManyByIds(ids: string[]) {
    return (await this.db.design.findMany({ where: { id: { in: ids } }, include })).map(toRecord);
  }

  async slugTaken(slug: string, exceptId?: string) {
    const row = await this.db.design.findUnique({ where: { slug }, select: { id: true } });
    return Boolean(row && row.id !== exceptId);
  }

  create(input: NewDesign, audit: AuditEntry, markReferenceDesigned?: string): Promise<DesignRecord> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.design.create({ data: input, include });
      if (markReferenceDesigned) {
        await tx.reference.update({ where: { id: markReferenceDesigned }, data: { status: 'DESIGNED' } });
      }
      await writeAudit(tx, { ...audit, entityId: row.id });
      return toRecord(row);
    });
  }

  update(id: string, patch: DesignPatch, audit: AuditEntry[]): Promise<DesignRecord> {
    const { collectionIds, ...data } = patch;
    return this.db.$transaction(async (tx) => {
      const row = await tx.design.update({
        where: { id },
        data: {
          ...data,
          ...(collectionIds ? { collections: { set: collectionIds.map((cid) => ({ id: cid })) } } : {}),
        },
        include,
      });
      await writeAudit(tx, audit);
      return toRecord(row);
    });
  }

  saveStatus(id: string, change: DesignStatusChange, audit: AuditEntry): Promise<DesignRecord> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.design.update({ where: { id }, data: change, include });
      await writeAudit(tx, audit);
      return toRecord(row);
    });
  }

  addImage(designId: string, image: Omit<DesignImageRecord, 'id' | 'sortOrder' | 'previewVersion'>): Promise<DesignRecord> {
    return this.db.$transaction(async (tx) => {
      const last = await tx.designImage.aggregate({ where: { designId }, _max: { sortOrder: true } });
      if (image.isPrimary) {
        await tx.designImage.updateMany({ where: { designId }, data: { isPrimary: false } });
      }
      await tx.designImage.create({ data: { ...image, designId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      return toRecord(await tx.design.findUniqueOrThrow({ where: { id: designId }, include }));
    });
  }

  updateImages(
    designId: string,
    images: { id: string; alt?: string | null; isPrimary: boolean; colourValueId?: string | null; isDetail?: boolean }[],
  ): Promise<DesignRecord> {
    return this.db.$transaction(async (tx) => {
      const primaryId = images.find((i) => i.isPrimary)?.id ?? images[0]?.id;
      if (primaryId) await tx.designImage.updateMany({ where: { designId }, data: { isPrimary: false } });
      for (const [index, image] of images.entries()) {
        await tx.designImage.update({
          where: { id: image.id },
          data: {
            sortOrder: index,
            isPrimary: image.id === primaryId,
            ...(image.alt !== undefined ? { alt: image.alt } : {}),
            ...(image.colourValueId !== undefined ? { colourValueId: image.colourValueId } : {}),
            ...(image.isDetail !== undefined ? { isDetail: image.isDetail } : {}),
          },
        });
      }
      return toRecord(await tx.design.findUniqueOrThrow({ where: { id: designId }, include }));
    });
  }

  async deleteImage(designId: string, imageId: string) {
    return this.db.$transaction(async (tx) => {
      const image = await tx.designImage.findFirst({ where: { id: imageId, designId } });
      if (!image) return null;
      await tx.designImage.delete({ where: { id: imageId } });
      if (image.isPrimary) {
        const next = await tx.designImage.findFirst({ where: { designId }, orderBy: { sortOrder: 'asc' } });
        if (next) await tx.designImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      return { storagePath: image.storagePath };
    });
  }

  setOptions(designId: string, options: DesignOptionRecord[], audit: AuditEntry): Promise<DesignRecord> {
    return this.db.$transaction(async (tx) => {
      await tx.designOption.deleteMany({ where: { designId } });
      await tx.designOption.createMany({ data: options.map((o) => ({ ...o, designId })) });
      await writeAudit(tx, audit);
      return toRecord(await tx.design.findUniqueOrThrow({ where: { id: designId }, include }));
    });
  }

  listForDesigner(designerId: string) {
    return this.db.design.findMany({
      where: { designerId },
      select: { id: true, name: true, status: true, reviewNotes: true, updatedAt: true, submittedAt: true, approvedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listAdmin(query: ListAdminDesignsQuery & { designerId?: string }) {
    const where: Prisma.DesignWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.designerId ? { designerId: query.designerId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q.toLowerCase() } },
              { tags: { has: query.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const rows = await this.db.design.findMany({
      where,
      include,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(query.cursor, query.limit),
    });
    return toPage(rows, query.limit, toRecord);
  }

  async listPublished(query: ListDesignsQuery, colourValueIds?: string[]) {
    const where = publishedWhere(query, colourValueIds);
    const orderBy: Prisma.DesignOrderByWithRelationInput[] =
      query.sort === 'price_asc'
        ? [{ basePriceInPaise: 'asc' }, { id: 'asc' }]
        : query.sort === 'price_desc'
          ? [{ basePriceInPaise: 'desc' }, { id: 'desc' }]
          : [{ publishedAt: 'desc' }, { id: 'desc' }];
    const rows = await this.db.design.findMany({ where, include, orderBy, ...pageArgs(query.cursor, query.limit) });
    return toPage(rows, query.limit, toRecord);
  }

  async facets(query: DesignFacetsQuery, colourValueIds: string[] | undefined, allColourIds: string[]): Promise<DesignFacetsRecord> {
    // Each count ignores its own filter, so every style (and colour) shows what picking it would give.
    const styleWhere = publishedWhere({ ...query, style: undefined }, colourValueIds);
    const colourWhere = publishedWhere({ ...query, colour: undefined }, undefined);
    const [byStyle, covers, byColour] = await Promise.all([
      this.db.design.groupBy({ by: ['style'], where: styleWhere, _count: { _all: true } }),
      // The newest design of each style, for its tile.
      this.db.design.findMany({
        where: styleWhere,
        distinct: ['style'],
        orderBy: [{ style: 'asc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        select: {
          style: true,
          images: {
            where: { isDetail: false },
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 1,
            select: { storagePath: true, previewVersion: true },
          },
        },
      }),
      allColourIds.length === 0
        ? Promise.resolve([])
        : this.db.designOption.groupBy({
            by: ['optionValueId'],
            where: { optionValueId: { in: allColourIds }, design: colourWhere },
            _count: { _all: true },
          }),
    ]);
    const cover = new Map(covers.map((c) => [c.style, c.images[0] ?? null]));
    return {
      styles: byStyle.map((s) => ({ style: s.style, count: s._count._all, image: cover.get(s.style) ?? null })),
      colourCounts: byColour.map((c) => ({ optionValueId: c.optionValueId, count: c._count._all })),
    };
  }

  countByStatus(status: DesignStatus) {
    return this.db.design.count({ where: { status } });
  }

  listAllImages() {
    return this.db.designImage.findMany({ select: { id: true, designId: true, storagePath: true } });
  }
}
