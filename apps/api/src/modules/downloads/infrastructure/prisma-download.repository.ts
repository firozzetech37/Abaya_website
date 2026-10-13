import { Injectable } from '@nestjs/common';
import type { Prisma } from '@abaya/db';
import type { DownloadStatus } from '@abaya/contracts';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { pageArgs, toPage } from '../../../common/pagination';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { DownloadRecord, DownloadRepository } from '../application/ports/downloads.ports';

const include = { user: { select: { id: true, name: true, email: true } } } satisfies Prisma.DesignDownloadInclude;
type Row = Prisma.DesignDownloadGetPayload<{ include: typeof include }>;

const toRecord = ({ user, design, updatedAt: _u, ...d }: Row): DownloadRecord => ({
  ...d,
  design: design as DownloadRecord['design'],
  customer: user,
});

@Injectable()
export class PrismaDownloadRepository implements DownloadRepository {
  constructor(private readonly db: PrismaService) {}

  async create(input: Parameters<DownloadRepository['create']>[0]) {
    return toRecord(await this.db.designDownload.create({ data: input, include }));
  }

  async findById(id: string) {
    const row = await this.db.designDownload.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  }

  async findPaid(userId: string, designId: string) {
    const row = await this.db.designDownload.findFirst({ where: { userId, designId, status: 'PAID' }, include });
    return row ? toRecord(row) : null;
  }

  async listPaid(userId: string) {
    const rows = await this.db.designDownload.findMany({ where: { userId, status: 'PAID' }, include, orderBy: { paidAt: 'desc' } });
    return rows.map(toRecord);
  }

  markPaid(id: string, at: Date, audit: AuditEntry): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const result = await tx.designDownload.updateMany({
        where: { id, status: { in: ['PENDING_PAYMENT', 'CANCELLED'] } },
        data: { status: 'PAID', paidAt: at },
      });
      if (result.count === 0) return false;
      await writeAudit(tx, audit);
      return true;
    });
  }

  async listAdmin(query: { status?: DownloadStatus; cursor?: string; limit: number }) {
    const rows = await this.db.designDownload.findMany({
      where: { status: query.status ?? 'PAID' },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(query.cursor, query.limit),
    });
    return toPage(rows, query.limit, toRecord);
  }

  async paidTotals(since: Date) {
    const [all, recent] = await Promise.all([
      this.db.designDownload.aggregate({ where: { status: 'PAID' }, _count: true, _sum: { priceInPaise: true } }),
      this.db.designDownload.count({ where: { status: 'PAID', paidAt: { gte: since } } }),
    ]);
    return { paidCount: all._count, revenueInPaise: all._sum.priceInPaise ?? 0, paidSince: recent };
  }
}
