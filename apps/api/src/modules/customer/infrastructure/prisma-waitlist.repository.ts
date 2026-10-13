import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { WaitlistRepository } from '../application/ordering.service';

@Injectable()
export class PrismaWaitlistRepository implements WaitlistRepository {
  constructor(private readonly db: PrismaService) {}

  async join(userId: string) {
    const row = await this.db.orderingWaitlist.upsert({ where: { userId }, create: { userId }, update: {} });
    return row.createdAt;
  }

  async joinedAt(userId: string) {
    return (await this.db.orderingWaitlist.findUnique({ where: { userId } }))?.createdAt ?? null;
  }

  async list(query: { cursor?: string; limit: number }) {
    const rows = await this.db.orderingWaitlist.findMany({
      orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { userId: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.userId ?? null) : null };
  }

  count() {
    return this.db.orderingWaitlist.count();
  }
}
