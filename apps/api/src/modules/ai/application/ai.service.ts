import { Inject, Injectable } from '@nestjs/common';
import type { AbayaStyle, AiAnalysisStatus, AiMatchLevel, AiStatusDto } from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import {
  type CombinedSuggestion,
  combineSuggestions,
  findMatches,
  type Match,
  type MatchThresholds,
  type Owner,
  ownerKey,
  ownerOf,
  SAME_PICTURE_HASH_DISTANCE,
  type SubjectKind,
} from '../domain/similarity';
import { AiWorker } from './ai-worker.service';
import { AI_REPOSITORY, type AiRepository, type EnqueueImage, IMAGE_ANALYZER, type ImageAnalyzer } from './ports/ai.ports';
import { SimilarityIndex } from './similarity-index';

export type { Match, Owner } from '../domain/similarity';
export { mergeTags } from '../domain/similarity';
export type { EnqueueImage, ImageSource } from './ports/ai.ports';

/** One design (all its images) or one reference, as the catalog module describes it. */
export type AiSubject =
  | { kind: 'DESIGN'; designId: string; images: { id: string; isPrimary: boolean }[]; tags: string[]; style: AbayaStyle }
  | { kind: 'REFERENCE'; referenceId: string; tags: string[] };

export interface AiInsights {
  status: AiAnalysisStatus;
  analysedImages: number;
  totalImages: number;
  suggestion: CombinedSuggestion | null;
  matches: Match[];
}

const subjectOf = (s: AiSubject): { kind: SubjectKind; ids: string[]; owner: Owner } =>
  s.kind === 'DESIGN'
    ? { kind: 'DESIGN_IMAGE', ids: s.images.map((i) => i.id), owner: { kind: 'DESIGN', id: s.designId } }
    : { kind: 'REFERENCE', ids: [s.referenceId], owner: { kind: 'REFERENCE', id: s.referenceId } };

/**
 * Image intelligence for the catalog: fingerprints for duplicate detection and tag
 * suggestions. Knows images only by id; the catalog module owns designs and references
 * and tells this module when images are added or removed.
 */
@Injectable()
export class AiService {
  private readonly thresholds: MatchThresholds;

  constructor(
    @Inject(AI_REPOSITORY) private readonly repo: AiRepository,
    @Inject(IMAGE_ANALYZER) private readonly analyzer: ImageAnalyzer,
    @Inject(APP_CONFIG) config: Pick<AppConfig, 'AI_DUPLICATE_THRESHOLD' | 'AI_SIMILAR_THRESHOLD'>,
    private readonly index: SimilarityIndex,
    private readonly worker: AiWorker,
  ) {
    this.thresholds = {
      duplicate: config.AI_DUPLICATE_THRESHOLD,
      similar: config.AI_SIMILAR_THRESHOLD,
      hashDistance: SAME_PICTURE_HASH_DISTANCE,
    };
  }

  get enabled(): boolean {
    return this.analyzer.enabled;
  }

  /** Queue new images for analysis (already-known images are left alone). */
  async enqueue(images: EnqueueImage[]): Promise<void> {
    if (!this.enabled || images.length === 0) return;
    const added = await this.repo.enqueue(images);
    if (added > 0) this.worker.kick();
  }

  async forget(kind: SubjectKind, subjectIds: string[]): Promise<void> {
    if (subjectIds.length > 0) await this.repo.remove(kind, subjectIds);
  }

  /** Make the AI table match the catalog: add missing images, drop deleted ones. */
  async sync(kind: SubjectKind, images: EnqueueImage[]): Promise<{ added: number; removed: number }> {
    if (!this.enabled) return { added: 0, removed: 0 };
    const removed = await this.repo.removeAllExcept(kind, images.map((i) => i.subjectId));
    const added = images.length > 0 ? await this.repo.enqueue(images) : 0;
    if (added > 0) this.worker.kick();
    return { added, removed };
  }

  async insights(subject: AiSubject): Promise<AiInsights> {
    const { kind, ids, owner } = subjectOf(subject);
    if (!this.enabled) return { status: 'OFF', analysedImages: 0, totalImages: ids.length, suggestion: null, matches: [] };

    const rows = await this.repo.findBySubjects(kind, ids);
    const done = rows.filter((r) => r.status === 'DONE');
    const failed = rows.filter((r) => r.status === 'FAILED');
    const status: AiAnalysisStatus =
      ids.length > 0 && failed.length === ids.length ? 'FAILED' : done.length + failed.length >= ids.length ? 'READY' : 'PENDING';

    const primaryIds = new Set(subject.kind === 'DESIGN' ? subject.images.filter((i) => i.isPrimary).map((i) => i.id) : ids);
    const pending = done.filter((r) => r.suggestionStatus === 'PENDING');
    const suggestion = combineSuggestions(
      pending.map((r) => ({ tags: r.tags, style: r.style, styleScore: r.styleScore, altText: r.altText, isPrimary: primaryIds.has(r.subjectId) })),
      { tags: subject.tags, style: subject.kind === 'DESIGN' ? subject.style : undefined },
    );

    const sources = await this.index.get(kind, ids);
    const matches = sources.length > 0 ? findMatches(sources, await this.index.all(), this.thresholds, owner) : [];
    return { status, analysedImages: done.length, totalImages: ids.length, suggestion, matches };
  }

  /** Strongest match level per design/reference, for list badges. */
  async matchLevels(owners: Owner[]): Promise<Map<string, AiMatchLevel>> {
    const levels = new Map<string, AiMatchLevel>();
    if (!this.enabled || owners.length === 0) return levels;
    const all = [...(await this.index.all())];
    const byOwner = new Map<string, typeof all>();
    for (const image of all) {
      const key = ownerKey(ownerOf(image));
      byOwner.set(key, [...(byOwner.get(key) ?? []), image]);
    }
    for (const owner of owners) {
      const sources = byOwner.get(ownerKey(owner)) ?? [];
      const best = sources.length > 0 ? findMatches(sources, all, this.thresholds, owner, 1)[0] : undefined;
      if (best) levels.set(ownerKey(owner), best.level);
    }
    return levels;
  }

  async markSuggestions(kind: SubjectKind, subjectIds: string[], status: 'APPLIED' | 'DISMISSED'): Promise<void> {
    if (subjectIds.length > 0) await this.repo.setSuggestionStatus(kind, subjectIds, status);
  }

  async status(): Promise<AiStatusDto> {
    const thresholds = { duplicate: this.thresholds.duplicate, similar: this.thresholds.similar };
    if (!this.enabled) {
      return { enabled: false, reachable: false, model: null, tagger: null, modelLoaded: false, queue: { queued: 0, done: 0, failed: 0 }, thresholds };
    }
    const [health, queue] = await Promise.all([this.analyzer.health(), this.repo.counts()]);
    return { enabled: true, reachable: health.reachable, model: health.model, tagger: health.tagger, modelLoaded: health.loaded, queue, thresholds };
  }

  async retryFailed(): Promise<number> {
    const n = await this.repo.retryFailed();
    if (n > 0) this.worker.kick();
    return n;
  }

  /** Analyse every image again, e.g. after changing the tag list or the model. */
  async reanalyseAll(): Promise<number> {
    const n = await this.repo.requeueAll();
    if (n > 0) this.worker.kick();
    return n;
  }
}
