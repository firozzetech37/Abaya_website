import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AnnouncementInput, AnnouncementRecord, AnnouncementRepository } from '../application/ports/catalog.ports';

@Injectable()
export class PrismaAnnouncementRepository implements AnnouncementRepository {
  constructor(private readonly db: PrismaService) {}

  list(): Promise<AnnouncementRecord[]> {
    return this.db.announcement.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  create(input: AnnouncementInput & { textEn: string; textAr: string }): Promise<AnnouncementRecord> {
    return this.db.announcement.create({ data: input });
  }

  async update(id: string, input: AnnouncementInput): Promise<AnnouncementRecord | null> {
    const { count } = await this.db.announcement.updateMany({ where: { id }, data: input });
    return count ? this.db.announcement.findUnique({ where: { id } }) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { count } = await this.db.announcement.deleteMany({ where: { id } });
    return count > 0;
  }
}
