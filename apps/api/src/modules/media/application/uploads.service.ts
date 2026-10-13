import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { UploadUrlResponse } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { WatermarkService } from '../../watermark/application/watermark.service';
import { IMAGE_CLEANER, type ImageCleaner, PREVIEW_IMAGE_SIDE } from './image-cleaner';
import {
  assertMayUpload,
  assertUploadPath,
  buildUploadPath,
  type UploadContentType,
  type UploadPurpose,
} from '../domain/upload-paths';

/** Port: issue a signed PUT URL for the private bucket. */
export interface UploadUrlSigner {
  signPrivateUpload(path: string): Promise<{ url: string; expiresInSeconds: number }>;
}
export const UPLOAD_URL_SIGNER = Symbol('UPLOAD_URL_SIGNER');

/** Port: files in the private bucket, and the public copies customers see. */
export interface PrivateFileStore {
  read(path: string): Promise<Buffer | null>;
  write(path: string, body: Buffer, contentType: string): Promise<void>;
  readPublic(path: string): Promise<Buffer | null>;
  writePublic(path: string, body: Buffer, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
}
export const PRIVATE_FILE_STORE = Symbol('PRIVATE_FILE_STORE');

/** Exported service: signed upload URLs, validation of paths clients send back, photo cleaning. */
@Injectable()
export class UploadsService {
  constructor(
    @Inject(UPLOAD_URL_SIGNER) private readonly signer: UploadUrlSigner,
    @Inject(PRIVATE_FILE_STORE) private readonly files: PrivateFileStore,
    @Inject(IMAGE_CLEANER) private readonly cleaner: ImageCleaner,
    private readonly watermark: WatermarkService,
  ) {}

  /**
   * Re-encode an uploaded photo in place (private bucket): EXIF such as GPS location is removed
   * and the size capped. Returns the cleaned size, or null if the file is not there yet.
   */
  async cleanPhoto(path: string): Promise<{ width: number; height: number } | null> {
    const original = await this.files.read(path);
    if (!original) return null;
    const cleaned = await this.cleaner.clean(original);
    await this.files.write(path, cleaned.body, cleaned.contentType);
    return { width: cleaned.width, height: cleaned.height };
  }

  /**
   * Publish a design's photos: the public bucket gets only a clean, smaller web preview at the
   * same path, carrying an invisible watermark with the design's id and a copyright notice; the
   * full-quality original stays private. Seed photos (only ever in the public bucket) are first
   * kept privately so the original is not lost. Returns how many were made.
   */
  async publishPreviews(designId: string, paths: string[]): Promise<number> {
    let made = 0;
    for (const path of paths) {
      let original = await this.files.read(path);
      if (!original && path.startsWith('seed/')) {
        original = await this.files.readPublic(path);
        if (original) await this.files.write(path, original, contentTypeOf(path));
      }
      if (!original) continue;
      const preview = await this.watermark.mark(original, { kind: 'DESIGN', id: designId }, { maxSide: PREVIEW_IMAGE_SIDE, quality: 82 });
      await this.files.writePublic(path, preview.body, preview.contentType);
      made++;
    }
    return made;
  }

  /** A licensed full-quality copy of a private photo at `destination`; false when missing. */
  async stampedCopy(source: string, destination: string, notice: string): Promise<boolean> {
    const original = await this.files.read(source);
    if (!original) return false;
    const stamped = await this.cleaner.stamp(original, notice);
    await this.files.write(destination, stamped.body, stamped.contentType);
    return true;
  }

  async createUploadUrl(
    actor: Actor,
    input: { purpose: UploadPurpose; contentType: UploadContentType },
  ): Promise<UploadUrlResponse> {
    assertMayUpload(actor.roles, input.purpose, input.contentType);
    const storagePath = buildUploadPath(input.purpose, input.contentType, randomUUID());
    const signed = await this.signer.signPrivateUpload(storagePath);
    return { uploadUrl: signed.url, storagePath, expiresInSeconds: signed.expiresInSeconds };
  }

  /** A fresh private-bucket path for a file the server makes itself (e.g. AI images). */
  pathFor(purpose: UploadPurpose, contentType: UploadContentType): string {
    return buildUploadPath(purpose, contentType, randomUUID());
  }

  assertPath(purpose: UploadPurpose, path: string): void {
    assertUploadPath(purpose, path);
  }

  /** A private copy of a private file under a new `purpose` path; null when the source is gone. */
  async copyPrivate(source: string, purpose: UploadPurpose): Promise<string | null> {
    const data = await this.files.read(source);
    if (!data) return null;
    const type = contentTypeOf(source) as UploadContentType;
    const path = buildUploadPath(purpose, type, randomUUID());
    await this.files.write(path, data, type);
    return path;
  }

  /** A file uploaded for `purpose` (path checked first); null when it is not there. */
  readUpload(purpose: UploadPurpose, path: string): Promise<Buffer | null> {
    assertUploadPath(purpose, path);
    return this.files.read(path);
  }

  /** Delete uploaded files for `purpose` (paths checked first). */
  removeUploads(purpose: UploadPurpose, paths: string[]): Promise<void> {
    for (const path of paths) assertUploadPath(purpose, path);
    return this.files.remove(paths);
  }
}

const contentTypeOf = (path: string) => (path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
