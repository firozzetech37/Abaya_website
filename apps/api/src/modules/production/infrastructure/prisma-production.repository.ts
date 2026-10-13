import { Injectable } from '@nestjs/common';
import type { Prisma } from '@abaya/db';
import type { PatternBody, TechPackContent } from '@abaya/contracts';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CuttingRecordRow,
  MakerInput,
  MakerRecord,
  PatternRecord,
  PayoutRecord,
  ProductionRepository,
  QcRecord,
  StitchingRecordRow,
  TechPackRecord,
} from '../application/ports/production.ports';

type MakerRow = Prisma.MakerGetPayload<object>;
const toMaker = ({ createdAt: _c, updatedAt: _u, rating, ...m }: MakerRow): MakerRecord => ({ ...m, rating: Number(rating) });

const techPackInclude = { approvedBy: { select: { id: true, name: true } } } satisfies Prisma.TechPackInclude;
type TechPackRow = Prisma.TechPackGetPayload<{ include: typeof techPackInclude }>;
const toTechPack = (t: TechPackRow): TechPackRecord => ({
  id: t.id,
  orderItemId: t.orderItemId,
  content: t.content as unknown as TechPackContent,
  status: t.status,
  approvedBy: t.approvedBy,
  approvedAt: t.approvedAt,
  updatedAt: t.updatedAt,
});

const qcInclude = { checkedBy: { select: { id: true, name: true } } } satisfies Prisma.QcCheckInclude;
type QcRow = Prisma.QcCheckGetPayload<{ include: typeof qcInclude }>;
const toQc = (q: QcRow): QcRecord => ({
  id: q.id,
  orderItemId: q.orderItemId,
  result: q.result,
  checklist: q.checklist as unknown as QcRecord['checklist'],
  notes: q.notes,
  photoPaths: q.photoPaths,
  checkedBy: q.checkedBy,
  createdAt: q.createdAt,
});

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

const patternInclude = {
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
} satisfies Prisma.PatternInclude;
type PatternRow = Prisma.PatternGetPayload<{ include: typeof patternInclude }>;

const toPattern = (r: PatternRow): PatternRecord => ({
  id: r.id,
  orderItemId: r.orderItemId,
  version: r.version,
  status: r.status,
  content: {
    measurements: r.measurements as PatternBody['measurements'],
    pieces: r.pieces as PatternBody['pieces'],
    fabricWidthCm: r.fabricWidthCm,
    fabricLengthCm: r.fabricLengthCm,
    liningLengthCm: r.liningLengthCm,
    seamAllowanceMm: r.seamAllowanceMm,
    notes: r.notes,
    files: r.files as PatternBody['files'],
  },
  createdBy: r.createdBy,
  confirmedBy: r.confirmedBy,
  confirmedAt: r.confirmedAt,
  updatedAt: r.updatedAt,
});

type StitchingRow = Prisma.StitchingRecordGetPayload<{ include: { stitchedBy: { select: { id: true; name: true } } } }>;
const toStitching = ({ stitchedById: _s, ...r }: StitchingRow): StitchingRecordRow => ({
  ...r,
  checklist: r.checklist as StitchingRecordRow['checklist'],
  measurements: r.measurements as StitchingRecordRow['measurements'],
});

@Injectable()
export class PrismaProductionRepository implements ProductionRepository {
  constructor(private readonly db: PrismaService) {}

  async listMakers() {
    return (await this.db.maker.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] })).map(toMaker);
  }

  async findMaker(id: string) {
    const row = await this.db.maker.findUnique({ where: { id } });
    return row ? toMaker(row) : null;
  }

  async findMakers(ids: string[]) {
    if (ids.length === 0) return [];
    return (await this.db.maker.findMany({ where: { id: { in: ids } } })).map(toMaker);
  }

  async findMakerByUserId(userId: string) {
    const row = await this.db.maker.findUnique({ where: { userId } });
    return row ? toMaker(row) : null;
  }

  setMakerUser(makerId: string, userId: string | null, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.maker.update({ where: { id: makerId }, data: { userId } });
      await writeAudit(tx, audit);
      return toMaker(row);
    });
  }

  async findMakerByEmail(email: string) {
    const row = await this.db.maker.findUnique({ where: { email: email.toLowerCase() } });
    return row ? toMaker(row) : null;
  }

  async findUnlinkedMakers(match: { email?: string | null; phoneLast10?: string | null }) {
    const or: Prisma.MakerWhereInput[] = [];
    if (match.email) or.push({ email: match.email.toLowerCase() });
    if (match.phoneLast10) or.push({ phone: { endsWith: match.phoneLast10 } });
    if (or.length === 0) return [];
    return (await this.db.maker.findMany({ where: { userId: null, isActive: true, OR: or } })).map(toMaker);
  }

  createMaker(input: Required<Omit<MakerInput, 'isActive' | 'email'>> & { isActive: boolean; email?: string }, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.maker.create({ data: input });
      await writeAudit(tx, { ...audit, entityId: row.id });
      return toMaker(row);
    });
  }

  updateMaker(id: string, input: MakerInput, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.maker.update({ where: { id }, data: input });
      await writeAudit(tx, audit);
      return toMaker(row);
    });
  }

  async listPatterns(orderItemId: string) {
    const rows = await this.db.pattern.findMany({ where: { orderItemId }, include: patternInclude, orderBy: { version: 'desc' } });
    return rows.map(toPattern);
  }

  async latestPatterns(orderItemIds: string[]) {
    const out = new Map<string, PatternRecord>();
    if (orderItemIds.length === 0) return out;
    const rows = await this.db.pattern.findMany({
      where: { orderItemId: { in: orderItemIds } },
      include: patternInclude,
      orderBy: { version: 'desc' },
    });
    for (const r of rows) if (!out.has(r.orderItemId)) out.set(r.orderItemId, toPattern(r));
    return out;
  }

  async savePatternDraft(orderItemId: string, content: PatternBody, userId: string) {
    const data = {
      measurements: json(content.measurements),
      pieces: json(content.pieces),
      fabricWidthCm: content.fabricWidthCm,
      fabricLengthCm: content.fabricLengthCm,
      liningLengthCm: content.liningLengthCm,
      seamAllowanceMm: content.seamAllowanceMm,
      notes: content.notes,
      files: json(content.files),
    };
    return this.db.$transaction(async (tx) => {
      const latest = await tx.pattern.findFirst({ where: { orderItemId }, orderBy: { version: 'desc' } });
      const row =
        latest?.status === 'DRAFT'
          ? await tx.pattern.update({ where: { id: latest.id }, data, include: patternInclude })
          : await tx.pattern.create({
              data: { ...data, orderItemId, version: (latest?.version ?? 0) + 1, createdById: userId },
              include: patternInclude,
            });
      return toPattern(row);
    });
  }

  async confirmPattern(patternId: string, userId: string, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.pattern.update({
        where: { id: patternId },
        data: { status: 'CONFIRMED', confirmedById: userId, confirmedAt: new Date() },
        include: patternInclude,
      });
      await writeAudit(tx, audit);
      return toPattern(row);
    });
  }

  async listCuttings(orderItemIds: string[]) {
    if (orderItemIds.length === 0) return [];
    const rows = await this.db.cuttingRecord.findMany({
      where: { orderItemId: { in: orderItemIds } },
      include: { cutBy: { select: { id: true, name: true } } },
      orderBy: [{ orderItemId: 'asc' }, { attempt: 'desc' }],
    });
    return rows.map(({ cutById: _c, ...r }) => ({ ...r, pieces: r.pieces as CuttingRecordRow['pieces'] }));
  }

  async addCutting(input: Omit<CuttingRecordRow, 'id' | 'attempt' | 'cutBy' | 'createdAt'> & { cutById: string }, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const last = await tx.cuttingRecord.findFirst({ where: { orderItemId: input.orderItemId }, orderBy: { attempt: 'desc' } });
      const { cutById: _c, ...row } = await tx.cuttingRecord.create({
        data: { ...input, pieces: json(input.pieces), attempt: (last?.attempt ?? 0) + 1 },
        include: { cutBy: { select: { id: true, name: true } } },
      });
      await writeAudit(tx, { ...audit, after: { ...(audit.after as object), attempt: row.attempt } });
      return { ...row, pieces: row.pieces as CuttingRecordRow['pieces'] };
    });
  }

  async listAssignments(orderItemIds: string[]) {
    if (orderItemIds.length === 0) return [];
    return this.db.workshopAssignment.findMany({
      where: { orderItemId: { in: orderItemIds } },
      select: { orderItemId: true, station: true, userId: true },
    });
  }

  async listAssignmentsForUsers(userIds: string[]) {
    if (userIds.length === 0) return [];
    return this.db.workshopAssignment.findMany({
      where: { userId: { in: userIds } },
      select: { orderItemId: true, station: true, userId: true },
    });
  }

  setAssignments(orderItemId: string, changes: { station: string; userId: string | null }[], assignedById: string, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      for (const c of changes) {
        if (c.userId === null) await tx.workshopAssignment.deleteMany({ where: { orderItemId, station: c.station } });
        else
          await tx.workshopAssignment.upsert({
            where: { orderItemId_station: { orderItemId, station: c.station } },
            create: { orderItemId, station: c.station, userId: c.userId, assignedById },
            update: { userId: c.userId, assignedById },
          });
      }
      await writeAudit(tx, audit);
    });
  }

  async listStitchings(orderItemIds: string[]) {
    if (orderItemIds.length === 0) return [];
    const rows = await this.db.stitchingRecord.findMany({
      where: { orderItemId: { in: orderItemIds } },
      include: { stitchedBy: { select: { id: true, name: true } } },
      orderBy: [{ orderItemId: 'asc' }, { attempt: 'desc' }],
    });
    return rows.map(toStitching);
  }

  async addStitching(
    input: Omit<StitchingRecordRow, 'id' | 'attempt' | 'stitchedBy' | 'createdAt'> & { stitchedById: string },
    audit: AuditEntry,
  ) {
    return this.db.$transaction(async (tx) => {
      const last = await tx.stitchingRecord.findFirst({ where: { orderItemId: input.orderItemId }, orderBy: { attempt: 'desc' } });
      const row = await tx.stitchingRecord.create({
        data: { ...input, checklist: json(input.checklist), measurements: json(input.measurements), attempt: (last?.attempt ?? 0) + 1 },
        include: { stitchedBy: { select: { id: true, name: true } } },
      });
      await writeAudit(tx, { ...audit, after: { ...(audit.after as object), attempt: row.attempt } });
      return toStitching(row);
    });
  }

  async findTechPack(orderItemId: string) {
    const row = await this.db.techPack.findUnique({ where: { orderItemId }, include: techPackInclude });
    return row ? toTechPack(row) : null;
  }

  async findTechPacks(orderItemIds: string[]) {
    if (orderItemIds.length === 0) return [];
    return (await this.db.techPack.findMany({ where: { orderItemId: { in: orderItemIds } }, include: techPackInclude })).map(toTechPack);
  }

  saveTechPack(orderItemId: string, content: TechPackContent, approvedById: string | null, audit?: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const approval = approvedById ? { status: 'APPROVED' as const, approvedById, approvedAt: new Date() } : {};
      const row = await tx.techPack.upsert({
        where: { orderItemId },
        create: { orderItemId, content: json(content), ...approval },
        update: { content: json(content), ...approval },
        include: techPackInclude,
      });
      if (audit) await writeAudit(tx, audit);
      return toTechPack(row);
    });
  }

  addQcCheck(input: Omit<QcRecord, 'id' | 'checkedBy' | 'createdAt'> & { checkedById: string }, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.qcCheck.create({
        data: {
          orderItemId: input.orderItemId,
          result: input.result,
          checklist: json(input.checklist),
          notes: input.notes,
          photoPaths: input.photoPaths,
          checkedById: input.checkedById,
        },
        include: qcInclude,
      });
      await writeAudit(tx, { ...audit, after: { ...(audit.after as object), qcCheckId: row.id } });
      return toQc(row);
    });
  }

  async listQcChecks(orderItemIds: string[]) {
    if (orderItemIds.length === 0) return [];
    const rows = await this.db.qcCheck.findMany({
      where: { orderItemId: { in: orderItemIds } },
      include: qcInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toQc);
  }

  async createPayout(input: { makerId: string; orderItemId: string; amountInPaise: number }) {
    return (await this.db.makerPayout.create({ data: input })) as PayoutRecord;
  }

  createPayoutOnce(input: { makerId: string; orderItemId: string; amountInPaise: number }) {
    return this.db.$transaction(async (tx) => {
      // Serialise concurrent QC passes for the same item.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.orderItemId}))`;
      const existing = await tx.makerPayout.findFirst({ where: { makerId: input.makerId, orderItemId: input.orderItemId } });
      if (existing) return null;
      return (await tx.makerPayout.create({ data: input })) as PayoutRecord;
    });
  }

  async listPayouts(makerId: string) {
    return (await this.db.makerPayout.findMany({ where: { makerId }, orderBy: { createdAt: 'desc' } })) as PayoutRecord[];
  }

  async pendingPayoutTotals() {
    const rows = await this.db.makerPayout.groupBy({ by: ['makerId'], where: { status: 'PENDING' }, _sum: { amountInPaise: true } });
    return new Map(rows.map((r) => [r.makerId, r._sum.amountInPaise ?? 0]));
  }

  markPayoutPaid(makerId: string, payoutId: string, reference: string, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const updated = await tx.makerPayout.updateMany({
        where: { id: payoutId, makerId, status: 'PENDING' },
        data: { status: 'PAID', reference, paidAt: new Date() },
      });
      if (updated.count === 0) return null;
      await writeAudit(tx, audit);
      return (await tx.makerPayout.findUniqueOrThrow({ where: { id: payoutId } })) as PayoutRecord;
    });
  }
}
