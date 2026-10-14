import type { CustomerPreviewKind, CustomerPreviewStatus } from '@abaya/contracts';

export interface CustomerPreviewRecord {
  id: string;
  userId: string;
  kind: CustomerPreviewKind;
  designId: string;
  previewKey: string | null;
  selectedOptionValueIds: string[];
  choices: string[];
  sourcePath: string;
  personPath: string | null;
  basePreviewId: string | null;
  prompt: string;
  endpoint: string;
  credits: number;
  providerJobId: string | null;
  status: CustomerPreviewStatus;
  attempts: number;
  error: string | null;
  resultPath: string | null;
  steps: string[];
  /** Each step's FASHN endpoint when they differ; empty: every step uses `endpoint`. */
  stepEndpoints: string[];
  step: number;
  workingPath: string | null;
  /** [{ text, critical }] for the accuracy check. */
  checks: unknown;
  retries: number;
  checkNotes: string | null;
  inaccurate: boolean;
  hidden: boolean;
  nextCheckAt: Date;
  submittedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date | null;
  /** Pictures deleted because the customer was inactive (the row stays for credits and limits). */
  purgedAt: Date | null;
  createdAt: Date;
}

export type NewCustomerPreview = Pick<
  CustomerPreviewRecord,
  | 'userId'
  | 'kind'
  | 'designId'
  | 'previewKey'
  | 'selectedOptionValueIds'
  | 'choices'
  | 'sourcePath'
  | 'personPath'
  | 'basePreviewId'
  | 'prompt'
  | 'endpoint'
  | 'credits'
  | 'expiresAt'
  | 'steps'
> & {
  stepEndpoints?: string[]; checks: { text: string; critical: boolean }[] | null };

export interface CustomerPreviewRepository {
  create(input: NewCustomerPreview): Promise<CustomerPreviewRecord>;
  findById(id: string): Promise<CustomerPreviewRecord | null>;
  /** The newest preview of this design + options that is not failed or hidden. */
  findShared(previewKey: string): Promise<CustomerPreviewRecord | null>;
  /** Requests a customer made since `since` that did not fail (they count towards her limit). */
  countByUserSince(userId: string, kind: CustomerPreviewKind, since: Date): Promise<number>;
  countSince(kind: CustomerPreviewKind, since: Date): Promise<number>;
  /** Credits of every customer request since `since` that did not fail. */
  creditsSince(since: Date): Promise<number>;
  claimDue(status: 'QUEUED' | 'RUNNING', now: Date, leaseUntil: Date, limit: number): Promise<CustomerPreviewRecord[]>;
  countRunning(): Promise<number>;
  markSubmitted(id: string, providerJobId: string, now: Date, nextCheckAt: Date): Promise<void>;
  reschedule(id: string, nextCheckAt: Date, opts?: { requeue?: boolean; countAttempt?: boolean; error?: string }): Promise<void>;
  /** Step done: the next step starts from its result. */
  nextStep(id: string, workingPath: string, step: number): Promise<void>;
  /** The check failed: start again from the first step with these prompts (credits added). */
  restart(id: string, steps: string[], credits: number, checkNotes: string): Promise<void>;
  complete(id: string, resultPath: string, now: Date, checkNotes?: string): Promise<void>;
  /** Failed the check twice: no picture, and the combination is remembered as not possible. */
  failInaccurate(id: string, error: string, checkNotes: string, now: Date): Promise<void>;
  fail(id: string, error: string, now: Date): Promise<void>;
  setHidden(id: string, hidden: boolean): Promise<CustomerPreviewRecord | null>;
  delete(id: string): Promise<void>;
  /** Try-ons whose photo and result must now be deleted. */
  listExpired(now: Date, limit: number): Promise<CustomerPreviewRecord[]>;
  listPreviews(query: { cursor?: string; limit: number; userId?: string }): Promise<{ items: CustomerPreviewRecord[]; nextCursor: string | null }>;
  /** FASHN usage per customer in [since, until) (admin "FASHN usage"). */
  usageByUser(since: Date, until: Date): Promise<CustomerUsageRow[]>;
  /** She may see this picture until `expiresAt` (renewed when she gets it again). */
  grantAccess(previewId: string, userId: string, at: Date, expiresAt: Date): Promise<void>;
  /** Until when she may see this picture; null when she has no access (or it ran out). */
  accessUntil(previewId: string, userId: string, now: Date): Promise<Date | null>;
  /** Her pictures of one design she may still see, newest first, with when each disappears. */
  listRecent(userId: string, designId: string, now: Date, limit: number): Promise<{ row: CustomerPreviewRecord; expiresAt: Date }[]>;
  /** All her pictures she may still see, from every design, newest first. */
  listMine(userId: string, now: Date, limit: number): Promise<{ row: CustomerPreviewRecord; expiresAt: Date }[]>;
  /** Finished pictures nobody may see any more (to delete): try-ons and previews made before their cut-off. */
  listUnclaimed(now: Date, madeBefore: { tryOns: Date; previews: Date }, limit: number): Promise<CustomerPreviewRecord[]>;
  /** Pictures deleted: paths cleared, the time recorded. */
  markPurged(id: string, at: Date): Promise<void>;
  /** The request whose id starts with these 8 hex digits (watermark look-up); null when none or ambiguous. */
  findByIdPrefix(prefix: string): Promise<CustomerPreviewRecord | null>;
  /** One customer's requests in [since, until), newest first. */
  listByUser(userId: string, since: Date, until: Date, limit: number): Promise<CustomerPreviewRecord[]>;
}

/** One customer's website previews and try-ons in a date range. */
export interface CustomerUsageRow {
  userId: string;
  previews: number;
  tryOns: number;
  /** Ended without a picture. */
  failed: number;
  /** Automatic remakes after the accuracy check. */
  remakes: number;
  /** Credits spent: requests that did not fail, plus previews that failed the accuracy check (they used FASHN). */
  credits: number;
  lastUsedAt: Date;
}
export const CUSTOMER_PREVIEW_REPOSITORY = Symbol('CUSTOMER_PREVIEW_REPOSITORY');

/** Private-bucket files: signed links for FASHN and the customer, saving results, deleting. */
export interface TryOnFiles {
  signedUrl(path: string, expiresInSeconds?: number): Promise<string>;
  read(path: string): Promise<Buffer | null>;
  write(path: string, data: Buffer, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  /**
   * A copy of this design photo for the try-on model: at most `maxSide` pixels, as a JPEG, made
   * once and reused. The original (often a 7–10 MB PNG) is returned when no copy can be made.
   */
  tryOnSource(path: string, maxSide: number): Promise<string>;
}
export const TRYON_FILES = Symbol('TRYON_FILES');

/** The FASHN account is shared with the Studio's AI Catalog (its module exports the client). */
export { FASHN_CLIENT, type FashnClient, FashnRequestError } from '../../../ai-catalog/application/ports/catalog.ports';

/** Gemini vision on the free key: checks a finished picture, and a customer photo before a try-on. */
export interface PreviewChecker {
  readonly available: boolean;
  /** One answer per check, or null when it could not check (no key, quota, error). */
  check(
    images: { label: string; data: Buffer; mimeType: string }[],
    question: string,
    count: number,
    /** `maxSide`: send each image at most this many pixels (a try-on check needs no originals). */
    opts?: { maxSide?: number },
  ): Promise<{ ok: boolean; problem: string }[] | null>;
  /** Is this photo usable for a try-on? null when it could not tell. */
  assessPhoto(photo: { data: Buffer; mimeType: string }, question: string): Promise<{ ok: boolean; reason: string } | null>;
  /**
   * Clean a customer's free-text wish for a preview: `kept` is the wish with only surface
   * changes (empty when nothing is allowed), `leftOut` the parts that would change the design.
   * null when it could not tell.
   */
  classifyRequest(question: string): Promise<{ kept: string; leftOut: string[] } | null>;
}
export const PREVIEW_CHECKER = Symbol('PREVIEW_CHECKER');

/** Puts her real face back on a finished photo try-on (FASHN retouches faces). */
export interface FaceKeeper {
  /**
   * The result with her own face from `original` blended in (`kept`), or the result unchanged
   * when the heads are not in the same position (`kept: false`, with how alike they were);
   * null when no face was found or it could not run.
   */
  keepFace(original: Buffer, result: Buffer): Promise<{ data: Buffer; contentType: string; score: number; kept: boolean } | null>;
}
export const FACE_KEEPER = Symbol('FACE_KEEPER');
