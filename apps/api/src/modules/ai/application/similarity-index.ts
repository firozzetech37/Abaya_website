import { Inject, Injectable } from '@nestjs/common';
import type { IndexedImage, SubjectKind } from '../domain/similarity';
import { AI_REPOSITORY, type AiRepository, type VectorRow } from './ports/ai.ports';

const keyOf = (kind: SubjectKind, subjectId: string) => `${kind}:${subjectId}`;

/**
 * Every analysed image's fingerprint, held in memory for fast comparison.
 *
 * At catalogue scale (tens of thousands of images, 512 numbers each) a full scan
 * takes a few milliseconds, so no vector database is needed (ADR 0005). Before each
 * use the index asks Postgres for a cheap change marker and pulls only changed rows,
 * so every API instance stays current without messaging.
 */
@Injectable()
export class SimilarityIndex {
  private readonly images = new Map<string, IndexedImage>();
  private rowIds = new Map<string, string>(); // row id → index key
  private seenUntil: Date | null = null;
  private seenCount = -1;
  private refreshing: Promise<void> | null = null;

  constructor(@Inject(AI_REPOSITORY) private readonly repo: AiRepository) {}

  async all(): Promise<Iterable<IndexedImage>> {
    await this.refresh();
    return this.images.values();
  }

  async get(kind: SubjectKind, subjectIds: string[]): Promise<IndexedImage[]> {
    await this.refresh();
    return subjectIds.map((id) => this.images.get(keyOf(kind, id))).filter((i): i is IndexedImage => Boolean(i));
  }

  /** Drop everything (tests, or after re-analysing with a new model). */
  reset(): void {
    this.images.clear();
    this.rowIds.clear();
    this.seenUntil = null;
    this.seenCount = -1;
  }

  private refresh(): Promise<void> {
    // Concurrent requests share one refresh.
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<void> {
    const version = await this.repo.vectorVersion();
    if (version.count === this.seenCount && version.latest?.getTime() === this.seenUntil?.getTime()) return;

    const incremental = this.seenCount >= 0 && version.count >= this.rowIds.size;
    if (!incremental) this.reset();
    for (const row of await this.repo.vectorsChangedSince(incremental ? this.seenUntil : null)) this.apply(row);
    // Rows were deleted since the last look: rebuild so removed images disappear.
    if (this.rowIds.size !== version.count) {
      this.reset();
      for (const row of await this.repo.vectorsChangedSince(null)) this.apply(row);
    }
    this.seenCount = version.count;
    this.seenUntil = version.latest;
  }

  private apply(row: VectorRow): void {
    const key = keyOf(row.kind, row.subjectId);
    this.rowIds.set(row.id, key);
    // Images queued for re-analysis keep their old fingerprint until the new one arrives.
    if (row.embedding.length === 0) {
      this.images.delete(key);
      return;
    }
    this.images.set(key, {
      kind: row.kind,
      subjectId: row.subjectId,
      designId: row.designId,
      vector: Float32Array.from(row.embedding),
      phash: row.phash,
    });
  }
}
