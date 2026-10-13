import { Injectable } from '@nestjs/common';
import type { OptionGroupCode, Prisma, SizeBandCode } from '@abaya/db';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { NotFoundError } from '../../../common/errors/domain-error';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  NewOptionValue,
  OptionCatalogRepository,
  OptionGroupRecord,
  OptionValuePatch,
  OptionValueRecord,
  SizeBandRecord,
} from '../application/ports/option-catalog.repository';

const valueInclude = { group: { select: { code: true, sortOrder: true } } } satisfies Prisma.OptionValueInclude;
type ValueRow = Prisma.OptionValueGetPayload<{ include: typeof valueInclude }>;

const toValue = ({ group, createdAt: _c, updatedAt: _u, ...v }: ValueRow): OptionValueRecord => ({
  ...v,
  groupCode: group.code,
});

type BandRow = Prisma.SizeBandGetPayload<object>;
const toBand = (b: BandRow): SizeBandRecord => ({
  ...b,
  bustMinCm: b.bustMinCm === null ? null : Number(b.bustMinCm),
  bustMaxCm: b.bustMaxCm === null ? null : Number(b.bustMaxCm),
});

const valueOrder: Prisma.OptionValueOrderByWithRelationInput[] = [
  { group: { sortOrder: 'asc' } },
  { sortOrder: 'asc' },
  { name: 'asc' },
];

@Injectable()
export class PrismaOptionCatalogRepository implements OptionCatalogRepository {
  constructor(private readonly db: PrismaService) {}

  listGroups(): Promise<OptionGroupRecord[]> {
    return this.db.optionGroup.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async listValues(): Promise<OptionValueRecord[]> {
    return (await this.db.optionValue.findMany({ include: valueInclude, orderBy: valueOrder })).map(toValue);
  }

  async findValuesByIds(ids: string[]): Promise<OptionValueRecord[]> {
    const rows = await this.db.optionValue.findMany({
      where: { id: { in: ids } },
      include: valueInclude,
      orderBy: valueOrder,
    });
    return rows.map(toValue);
  }

  async findValue(id: string): Promise<OptionValueRecord | null> {
    const row = await this.db.optionValue.findUnique({ where: { id }, include: valueInclude });
    return row ? toValue(row) : null;
  }

  async createValue(input: NewOptionValue, audit: AuditEntry): Promise<OptionValueRecord> {
    return this.db.$transaction(async (tx) => {
      const group = await tx.optionGroup.findUnique({ where: { code: input.groupCode as OptionGroupCode } });
      if (!group) throw new NotFoundError('Option group');
      const last = await tx.optionValue.aggregate({ where: { groupId: group.id }, _max: { sortOrder: true } });
      const { groupCode: _g, ...data } = input;
      const row = await tx.optionValue.create({
        data: { ...data, groupId: group.id, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        include: valueInclude,
      });
      await writeAudit(tx, { ...audit, entityId: row.id });
      return toValue(row);
    });
  }

  async updateValue(id: string, patch: OptionValuePatch, audit: AuditEntry[]): Promise<OptionValueRecord> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.optionValue.update({ where: { id }, data: patch, include: valueInclude });
      await writeAudit(tx, audit);
      return toValue(row);
    });
  }

  async listSizeBands(): Promise<SizeBandRecord[]> {
    return (await this.db.sizeBand.findMany({ orderBy: { sortOrder: 'asc' } })).map(toBand);
  }

  async findSizeBand(id: string): Promise<SizeBandRecord | null> {
    const row = await this.db.sizeBand.findUnique({ where: { id } });
    return row ? toBand(row) : null;
  }

  async findSizeBandByCode(code: SizeBandCode): Promise<SizeBandRecord | null> {
    const row = await this.db.sizeBand.findUnique({ where: { code } });
    return row ? toBand(row) : null;
  }

  async updateSizeBand(
    id: string,
    patch: { label?: string; adjustmentInPaise?: number; isActive?: boolean },
    audit: AuditEntry[],
  ): Promise<SizeBandRecord> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.sizeBand.update({ where: { id }, data: patch });
      await writeAudit(tx, audit);
      return toBand(row);
    });
  }
}
