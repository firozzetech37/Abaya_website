import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { ContentTranslationRepository } from '../application/content-translation.service';

@Injectable()
export class PrismaContentTranslationRepository implements ContentTranslationRepository {
  constructor(private readonly db: PrismaService) {}

  async find(lang: string, hashes: string[]) {
    if (hashes.length === 0) return new Map<string, string>();
    const rows = await this.db.contentTranslation.findMany({ where: { lang, sourceHash: { in: [...new Set(hashes)] } } });
    return new Map(rows.map((r) => [r.sourceHash, r.text]));
  }

  async save(lang: string, rows: { hash: string; source: string; text: string }[]) {
    if (rows.length === 0) return;
    await this.db.contentTranslation.createMany({
      data: rows.map((r) => ({ lang, sourceHash: r.hash, source: r.source, text: r.text })),
      skipDuplicates: true,
    });
  }
}
