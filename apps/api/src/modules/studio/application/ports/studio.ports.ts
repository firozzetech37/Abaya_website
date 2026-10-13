import type { GenerationStatus, PinterestBoardDto, PinterestPinDto } from '@abaya/contracts';
import type { AuditEntry } from '../../../../common/audit/audit';

export interface GeneratedImageRecord {
  id: string;
  storagePath: string;
  favourite: boolean;
  designId: string | null;
  sortOrder: number;
}

export interface GenerationRecord {
  id: string;
  designerId: string;
  prompt: string;
  options: Record<string, string>;
  sketchPath: string | null;
  inspirationUrl: string | null;
  provider: string;
  model: string;
  status: GenerationStatus;
  attempts: number;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  images: GeneratedImageRecord[];
}

export interface StudioRepository {
  create(
    input: Pick<GenerationRecord, 'designerId' | 'prompt' | 'options' | 'sketchPath' | 'inspirationUrl' | 'provider' | 'model'>,
    audit: AuditEntry,
  ): Promise<GenerationRecord>;
  countSince(designerId: string, since: Date): Promise<number>;
  listForDesigner(designerId: string, limit: number): Promise<GenerationRecord[]>;
  findById(id: string): Promise<GenerationRecord | null>;
  /** Take the next queued (or abandoned) generation, or null. */
  claimNext(now: Date, leaseMs: number): Promise<GenerationRecord | null>;
  complete(id: string, paths: string[]): Promise<void>;
  /** retryAt null: give up (FAILED). */
  fail(id: string, error: string, retryAt: Date | null): Promise<void>;
  findImage(imageId: string): Promise<{ image: GeneratedImageRecord; generation: GenerationRecord } | null>;
  setFavourite(imageId: string, favourite: boolean): Promise<void>;
  linkDesign(imageId: string, designId: string): Promise<void>;
}
export const STUDIO_REPOSITORY = Symbol('STUDIO_REPOSITORY');

/** One image per call. `live` is false for the test generator (placeholder images). */
export interface ImageGenerator {
  readonly provider: string;
  readonly model: string;
  readonly live: boolean;
  generate(request: {
    prompt: string;
    /** The designer's own sketch (never a Pinterest image). */
    sketch?: { data: Buffer; mimeType: string };
    /** For the test generator: which variation, and the chosen colour. */
    variation: number;
    colour?: string;
  }): Promise<{ data: Buffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }>;
}
export const IMAGE_GENERATOR = Symbol('IMAGE_GENERATOR');

/** Thrown for problems a retry will not fix (bad key, refused prompt). */
export class PermanentGenerationError extends Error {}

/** Pinterest: official oEmbed for pasted links, API v5 for the company's own boards. */
export interface PinterestClient {
  readonly connected: boolean;
  /** Follow short pin.it links to the canonical pin URL. */
  canonicalUrl(url: string): Promise<string>;
  oembed(url: string): Promise<{ title: string | null; author: string | null; imageUrl: string | null } | null>;
  boards(): Promise<PinterestBoardDto[]>;
  boardPins(boardId: string): Promise<PinterestPinDto[]>;
}
export const PINTEREST_CLIENT = Symbol('PINTEREST_CLIENT');

/** Private-bucket files the Studio reads and writes (sketches, generated images). */
export interface StudioFiles {
  read(path: string): Promise<Buffer | null>;
  write(path: string, data: Buffer, contentType: string): Promise<void>;
  signedUrl(path: string): Promise<string>;
}
export const STUDIO_FILES = Symbol('STUDIO_FILES');
