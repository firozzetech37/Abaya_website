import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../common/storage/object-storage';
import type { TryOnFiles } from '../application/ports/try-on.ports';

/** Customer photos, previews and try-on results live in the private bucket only. */
@Injectable()
export class StorageTryOnFiles implements TryOnFiles {
  private readonly logger = new Logger(StorageTryOnFiles.name);

  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  /**
   * The try-on copy of a design photo, kept beside the originals in the private bucket and named
   * after the original's path (a new photo gets a new copy). Made on the first try-on, reused after.
   */
  async tryOnSource(path: string, maxSide: number): Promise<string> {
    const copy = `tryon-sources/${createHash('sha256').update(path).digest('hex').slice(0, 32)}-${maxSide}.jpg`;
    try {
      if (await this.storage.get('private', copy)) return copy;
      const original = await this.storage.get('private', path);
      if (!original) return path;
      const small = await sharp(original, { failOn: 'none' })
        .rotate()
        .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
      await this.storage.put('private', copy, small, 'image/jpeg');
      return copy;
    } catch (e) {
      this.logger.warn({ path, err: e instanceof Error ? e.message : e }, 'Could not make the try-on copy; using the original');
      return path;
    }
  }

  signedUrl(path: string, expiresInSeconds?: number) {
    return this.storage.createSignedReadUrl('private', path, expiresInSeconds);
  }

  read(path: string) {
    return this.storage.get('private', path);
  }

  write(path: string, data: Buffer, contentType: string) {
    return this.storage.put('private', path, data, contentType);
  }

  async remove(paths: string[]) {
    if (paths.length > 0) await this.storage.remove('private', paths);
  }
}
