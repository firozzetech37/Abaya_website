import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { UpstreamError } from '../errors/domain-error';
import { SignedUrlBatcher } from './signed-url-batcher';

export type BucketKind = 'public' | 'private';

/** Supabase Storage (or a fake in tests). Only infrastructure/ adapters inject it. */
export interface ObjectStorage {
  /** Short-lived URL a client can PUT one file to. */
  createSignedUploadUrl(bucket: BucketKind, path: string): Promise<{ url: string; expiresInSeconds: number }>;
  /** Short-lived URL to read a private object. */
  /** `downloadAs`: the browser saves the file under this name instead of showing it. */
  createSignedReadUrl(bucket: BucketKind, path: string, expiresInSeconds?: number, downloadAs?: string): Promise<string>;
  /** Permanent URL of an object in the public bucket. */
  publicUrl(path: string): string;
  /** Copy an object between buckets, keeping its path (used when a design is published). */
  copy(from: BucketKind, to: BucketKind, path: string): Promise<void>;
  remove(bucket: BucketKind, paths: string[]): Promise<void>;
  /** Write a file the server made (cleaned uploads, AI images). Overwrites. */
  put(bucket: BucketKind, path: string, body: Buffer, contentType: string): Promise<void>;
  /** Read a file (null when it does not exist). */
  get(bucket: BucketKind, path: string): Promise<Buffer | null>;
}
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** Signed read URLs for private files expire after 10 minutes (docs/architecture.md §5). */
export const PRIVATE_URL_TTL_SECONDS = 600;
const UPLOAD_URL_TTL_SECONDS = 7200; // Supabase signed upload URLs last 2 hours

@Injectable()
export class SupabaseObjectStorage implements ObjectStorage {
  private readonly client: SupabaseClient;
  private readonly buckets: Record<BucketKind, string>;
  private readonly baseUrl: string;
  private readonly signers: Record<BucketKind, SignedUrlBatcher>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.baseUrl = config.SUPABASE_URL.replace(/\/$/, '');
    this.client = createClient(this.baseUrl, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.buckets = {
      public: config.SUPABASE_STORAGE_BUCKET_DESIGNS,
      private: config.SUPABASE_STORAGE_BUCKET_PRIVATE,
    };
    // Links asked for at the same moment are signed in one request and reused for a while.
    const signManyIn = (bucket: BucketKind) => async (paths: string[], expiresIn: number) => {
      const { data, error } = await this.client.storage.from(this.buckets[bucket]).createSignedUrls(paths, expiresIn);
      if (error || !data) throw new UpstreamError('STORAGE_FAILED', 'Could not load the files.');
      const byPath = new Map(data.map((d) => [d.path, d.error ? null : d.signedUrl]));
      return paths.map((p) => byPath.get(p) ?? null);
    };
    this.signers = { public: new SignedUrlBatcher(signManyIn('public')), private: new SignedUrlBatcher(signManyIn('private')) };
  }

  async createSignedUploadUrl(bucket: BucketKind, path: string) {
    const { data, error } = await this.client.storage.from(this.buckets[bucket]).createSignedUploadUrl(path);
    if (error || !data) throw new UpstreamError('STORAGE_FAILED', 'Could not prepare the upload.');
    return { url: data.signedUrl, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
  }

  async createSignedReadUrl(bucket: BucketKind, path: string, expiresInSeconds = PRIVATE_URL_TTL_SECONDS, downloadAs?: string) {
    if (!downloadAs) {
      try {
        return await this.signers[bucket].sign(path, expiresInSeconds);
      } catch {
        throw new UpstreamError('STORAGE_FAILED', 'Could not load the file.');
      }
    }
    // Download links (a file name for the browser) are signed on their own.
    const { data, error } = await this.client.storage
      .from(this.buckets[bucket])
      .createSignedUrl(path, expiresInSeconds, downloadAs ? { download: downloadAs } : undefined);
    if (error || !data) throw new UpstreamError('STORAGE_FAILED', 'Could not load the file.');
    return data.signedUrl;
  }

  publicUrl(path: string): string {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return `${this.baseUrl}/storage/v1/object/public/${this.buckets.public}/${encoded}`;
  }

  async copy(from: BucketKind, to: BucketKind, path: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.buckets[from])
      .copy(path, path, { destinationBucket: this.buckets[to] });
    // Re-publishing copies the same file again; "already exists" is fine.
    if (error && !/exists/i.test(error.message)) {
      throw new UpstreamError('STORAGE_FAILED', `Could not copy ${path}.`);
    }
  }

  async remove(bucket: BucketKind, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(this.buckets[bucket]).remove(paths);
    if (error) throw new UpstreamError('STORAGE_FAILED', 'Could not delete files.');
  }

  async put(bucket: BucketKind, path: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(this.buckets[bucket]).upload(path, body, { contentType, upsert: true });
    if (error) throw new UpstreamError('STORAGE_FAILED', `Could not save ${path}.`);
  }

  async get(bucket: BucketKind, path: string): Promise<Buffer | null> {
    const { data, error } = await this.client.storage.from(this.buckets[bucket]).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
}

@Global()
@Module({
  providers: [{ provide: OBJECT_STORAGE, useClass: SupabaseObjectStorage }],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
