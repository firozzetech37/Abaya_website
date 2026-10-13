import type {
  CatalogJobKind,
  CatalogJobStatus,
  CatalogMode,
  CatalogResolution,
  CatalogReview,
  CatalogView,
} from '@abaya/contracts';
import type { AuditEntry } from '../../../../common/audit/audit';

/** Storage paths and notes a job was made from (kept for the dataset). */
export interface CatalogJobInputs {
  abayaPath?: string;
  backPath?: string;
  modelPath?: string;
  sourcePath?: string;
  maskPath?: string;
  /** A reference photo for an edit (e.g. the designer's own background photo). */
  contextPath?: string;
  /** One step: a real person's face (with consent) and the designer's own background photo. */
  facePath?: string;
  faceConsent?: boolean;
  backgroundPath?: string;
  garmentDescription?: string;
  /** Abaya style and embroidery placement (they choose and phrase the poses). */
  style?: string;
  embroidery?: string[];
  /** The designer's own direction. */
  direction?: string;
  /** The abaya image is the designer's sketch; design reference photos with notes. */
  sketch?: boolean;
  references?: { type: string; path: string; note?: string }[];
  /** Framing, handbag and shoes. */
  styling?: Record<string, unknown>;
  backgroundId?: string;
  attributes?: Record<string, unknown>;
}

export interface CatalogImageRecord {
  id: string;
  jobId: string;
  storagePath: string;
  sortOrder: number;
  review: CatalogReview;
  reasons: string[];
  scores: Record<string, number> | null;
  note: string | null;
  designId: string | null;
}

export interface CatalogJobRecord {
  id: string;
  createdById: string;
  /** Started from this design's Images tab, else null. */
  designId: string | null;
  kind: CatalogJobKind;
  view: CatalogView;
  modelProfileId: string | null;
  parentImageId: string | null;
  retryOfImageId: string | null;
  /** Starts after this job finishes, from its first image. */
  afterJobId: string | null;
  retryCount: number;
  inputs: CatalogJobInputs;
  editType: string | null;
  instruction: string | null;
  prompt: string;
  endpoint: string;
  resolution: CatalogResolution;
  mode: CatalogMode;
  numImages: number;
  seed: number;
  aspectRatio: string | null;
  creditsEstimated: number;
  creditsUsed: number | null;
  provider: string;
  providerJobId: string | null;
  status: CatalogJobStatus;
  attempts: number;
  error: string | null;
  submittedAt: Date | null;
  flags: string[];
  createdAt: Date;
  finishedAt: Date | null;
  images: CatalogImageRecord[];
}

export type NewCatalogJob = {
  designId?: string | null;
  /** Wait for the job created just before this one (references applied in order). */
  afterPrevious?: boolean;
  /** Wait for the job at this position in the same request (photoshoot shots all wait for one image). */
  afterIndex?: number;
} & Pick<
  CatalogJobRecord,
  | 'createdById'
  | 'kind'
  | 'view'
  | 'modelProfileId'
  | 'parentImageId'
  | 'retryOfImageId'
  | 'retryCount'
  | 'inputs'
  | 'editType'
  | 'instruction'
  | 'prompt'
  | 'endpoint'
  | 'resolution'
  | 'mode'
  | 'numImages'
  | 'seed'
  | 'aspectRatio'
  | 'creditsEstimated'
  | 'provider'
  | 'flags'
>;

export interface CatalogModelProfileRecord {
  id: string;
  name: string;
  type: 'AI' | 'PERSONAL';
  imagePath: string;
  description: string | null;
  createdBy: { id: string; name: string | null };
  archivedAt: Date | null;
  createdAt: Date;
  /** Different abayas this model has worn in a master. */
  abayaCount: number;
}

export interface CatalogPromptPresetRecord {
  id: string;
  name: string;
  text: string;
  createdBy: { id: string; name: string | null };
  archivedAt: Date | null;
  createdAt: Date;
}

/** One staff member's Studio jobs in a date range. */
export interface StudioUsageRow {
  userId: string;
  jobs: number;
  /** Ended without a picture (cost nothing). */
  failed: number;
  /** Jobs that retried an earlier image. */
  remakes: number;
  /** FASHN's reported credits when known, else the estimate; failed jobs cost nothing. */
  credits: number;
  lastUsedAt: Date;
}

export interface CatalogRepository {
  createJobs(jobs: NewCatalogJob[], audit: AuditEntry): Promise<CatalogJobRecord[]>;
  findJob(id: string): Promise<CatalogJobRecord | null>;
  /** Newest first; `activeOnly`: just the jobs still waiting or running (for polling). */
  listJobs(query: {
    createdById?: string;
    designId?: string;
    limit: number;
    cursor?: string;
    activeOnly?: boolean;
  }): Promise<{
    items: CatalogJobRecord[];
    nextCursor: string | null;
  }>;
  findImage(id: string): Promise<{ image: CatalogImageRecord; job: CatalogJobRecord } | null>;
  /** Credits asked for since `since` (failed jobs cost nothing). */
  creditsSince(createdById: string, since: Date): Promise<number>;
  /** FASHN usage per staff member in [since, until) (admin "FASHN usage"). */
  usageByCreator(since: Date, until: Date): Promise<StudioUsageRow[]>;
  /** One staff member's jobs in [since, until), newest first, with their images. */
  listJobsByCreator(createdById: string, since: Date, until: Date, limit: number): Promise<CatalogJobRecord[]>;
  countRunning(): Promise<number>;
  /** Take up to `limit` due jobs in `status`, hiding them from other workers until `leaseUntil`. */
  claimDue(
    status: 'QUEUED' | 'RUNNING',
    now: Date,
    leaseUntil: Date,
    limit: number,
  ): Promise<CatalogJobRecord[]>;
  markSubmitted(id: string, providerJobId: string, at: Date, nextCheckAt: Date): Promise<void>;
  /** Back to QUEUED (or keep RUNNING) and look again at `nextCheckAt`. */
  reschedule(
    id: string,
    nextCheckAt: Date,
    patch?: { requeue?: boolean; error?: string; countAttempt?: boolean },
  ): Promise<void>;
  complete(id: string, paths: string[], creditsUsed: number | null): Promise<void>;
  /** A chained job's turn: it starts from the previous job's image. */
  startFrom(id: string, image: { id: string; storagePath: string }): Promise<void>;
  fail(id: string, error: string): Promise<void>;
  reviewImage(
    id: string,
    data: {
      review: CatalogReview;
      reasons: string[];
      scores: Record<string, number> | null;
      note: string | null;
      reviewedById: string;
    },
    audit: AuditEntry,
  ): Promise<void>;
  linkDesign(imageId: string, designId: string): Promise<void>;
  createProfile(
    data: Omit<
      CatalogModelProfileRecord,
      'id' | 'createdBy' | 'archivedAt' | 'createdAt' | 'abayaCount'
    > & {
      createdById: string;
      attributes?: Record<string, unknown>;
      consentAt?: Date;
    },
    audit: AuditEntry,
  ): Promise<CatalogModelProfileRecord>;
  countProfiles(): Promise<number>;
  listProfiles(): Promise<CatalogModelProfileRecord[]>;
  findProfile(id: string): Promise<CatalogModelProfileRecord | null>;
  archiveProfile(id: string): Promise<void>;
  createPreset(data: {
    name: string;
    text: string;
    createdById: string;
  }): Promise<CatalogPromptPresetRecord>;
  listPresets(): Promise<CatalogPromptPresetRecord[]>;
  findPreset(id: string): Promise<CatalogPromptPresetRecord | null>;
  archivePreset(id: string): Promise<void>;
}
export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export type FashnStatus =
  | { state: 'pending' }
  | { state: 'completed'; output: string[]; creditsUsed: number | null }
  | { state: 'failed'; errorName: string; message: string };

/** FASHN API (or the free test stand-in until FASHN_API_KEY is set). */
export interface FashnClient {
  readonly live: boolean;
  run(endpoint: string, inputs: Record<string, unknown>): Promise<{ id: string }>;
  status(id: string): Promise<FashnStatus>;
  /** Download a result (CDN URLs expire after 3 days, so results are copied straight away). */
  download(url: string): Promise<{ data: Buffer; contentType: 'image/png' | 'image/jpeg' }>;
  /** Account balance, or null when it cannot be read. */
  credits(): Promise<number | null>;
}
export const FASHN_CLIENT = Symbol('FASHN_CLIENT');

/** Request-level FASHN failures (before a prediction exists). */
export class FashnRequestError extends Error {
  constructor(
    readonly kind: 'auth' | 'rate' | 'credits' | 'invalid' | 'server' | 'network',
    message: string,
  ) {
    super(message);
  }
}

/** Private-bucket files: signed links for FASHN and the panel, and saving results. */
export interface CatalogFiles {
  signedUrl(path: string, expiresInSeconds?: number): Promise<string>;
  read(path: string): Promise<Buffer | null>;
  write(path: string, data: Buffer, contentType: string): Promise<void>;
}
export const CATALOG_FILES = Symbol('CATALOG_FILES');

/** Describes a reference photo in a few words (Gemini vision, text only; works on the free key). */
export interface ImageDescriber {
  readonly available: boolean;
  describe(image: { data: Buffer; mimeType: string }, instruction: string): Promise<string | null>;
}
export const IMAGE_DESCRIBER = Symbol('IMAGE_DESCRIBER');
