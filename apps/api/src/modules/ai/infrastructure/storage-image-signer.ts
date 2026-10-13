import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../common/storage/object-storage';
import type { ImageSource, ImageUrlSigner } from '../application/ports/ai.ports';

/** The AI service downloads right away; a fresh URL is signed for every attempt. */
const AI_READ_URL_TTL_SECONDS = 900;

@Injectable()
export class StorageImageSigner implements ImageUrlSigner {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  async urlFor(source: ImageSource): Promise<string> {
    if ('url' in source) return source.url;
    if (source.bucket === 'public') return this.storage.publicUrl(source.path);
    return this.storage.createSignedReadUrl('private', source.path, AI_READ_URL_TTL_SECONDS);
  }
}
