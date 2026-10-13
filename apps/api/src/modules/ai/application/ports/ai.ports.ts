import type { AbayaStyle, AiSuggestedTag } from '@abaya/contracts';
import type { SubjectKind } from '../../domain/similarity';

/** Where to fetch an image: a Storage object (signed at analysis time) or an external URL. */
export type ImageSource = { bucket: 'public' | 'private'; path: string } | { url: string };

export interface AnalysisResult {
  model: string;
  tagger: string;
  embedding: number[];
  phash: string;
  tags: AiSuggestedTag[];
  style: { value: AbayaStyle; score: number } | null;
  altText: string | null;
}

export interface AnalyzerHealth {
  reachable: boolean;
  model: string | null;
  tagger: string | null;
  loaded: boolean;
}

/** The Python AI service (services/ai), or a fake in tests. */
export interface ImageAnalyzer {
  readonly enabled: boolean;
  analyze(imageUrl: string): Promise<AnalysisResult>;
  health(): Promise<AnalyzerHealth>;
}
export const IMAGE_ANALYZER = Symbol('IMAGE_ANALYZER');

/** The image itself can never be analysed (not an image, host not allowed). Do not retry. */
export class PermanentAnalysisError extends Error {}
/** The AI service is down or unreachable. Not the image's fault: retry later without using up attempts. */
export class AnalyzerUnavailableError extends Error {}

export interface ImageUrlSigner {
  urlFor(source: ImageSource): Promise<string>;
}
export const IMAGE_URL_SIGNER = Symbol('IMAGE_URL_SIGNER');

export interface EnqueueImage {
  kind: SubjectKind;
  subjectId: string;
  designId: string | null;
  source: ImageSource;
}

export interface ClaimedImage {
  id: string;
  kind: SubjectKind;
  subjectId: string;
  source: ImageSource;
  attempts: number;
}

export interface AiImageRecord {
  id: string;
  kind: SubjectKind;
  subjectId: string;
  designId: string | null;
  status: 'QUEUED' | 'DONE' | 'FAILED';
  error: string | null;
  tags: AiSuggestedTag[];
  style: AbayaStyle | null;
  styleScore: number | null;
  altText: string | null;
  suggestionStatus: 'PENDING' | 'APPLIED' | 'DISMISSED';
}

export interface VectorRow {
  id: string;
  kind: SubjectKind;
  subjectId: string;
  designId: string | null;
  status: 'QUEUED' | 'DONE' | 'FAILED';
  embedding: number[];
  phash: string | null;
  updatedAt: Date;
}

export interface AiRepository {
  /** Adds images not seen before (existing rows are left alone). Returns how many were added. */
  enqueue(items: EnqueueImage[]): Promise<number>;
  remove(kind: SubjectKind, subjectIds: string[]): Promise<void>;
  /** Deletes rows of this kind whose subject no longer exists. */
  removeAllExcept(kind: SubjectKind, keepSubjectIds: string[]): Promise<number>;

  /** Leases due images with FOR UPDATE SKIP LOCKED, so several API instances can share the work. */
  claimDue(limit: number): Promise<ClaimedImage[]>;
  saveResult(id: string, result: AnalysisResult): Promise<void>;
  markRetry(id: string, attempts: number, nextAttemptAt: Date, error: string): Promise<void>;
  markFailed(id: string, attempts: number, error: string): Promise<void>;
  /** Put leased images back without counting an attempt (the AI service was down). */
  release(ids: string[], nextAttemptAt: Date): Promise<void>;

  findBySubjects(kind: SubjectKind, subjectIds: string[]): Promise<AiImageRecord[]>;
  setSuggestionStatus(kind: SubjectKind, subjectIds: string[], status: 'APPLIED' | 'DISMISSED'): Promise<void>;

  /** Cheap change marker for the in-memory index: row count and latest update. */
  vectorVersion(): Promise<{ count: number; latest: Date | null }>;
  /** Rows changed after `since` (all rows when omitted). */
  vectorsChangedSince(since: Date | null): Promise<VectorRow[]>;

  counts(): Promise<{ queued: number; done: number; failed: number }>;
  retryFailed(): Promise<number>;
  requeueAll(): Promise<number>;
}
export const AI_REPOSITORY = Symbol('AI_REPOSITORY');
