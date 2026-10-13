import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../common/storage/object-storage';
import type { OrderMedia } from '../application/ports/orders.ports';

@Injectable()
export class StorageOrderMedia implements OrderMedia {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  /** Stage and QC photos live in the private bucket; URLs expire after 10 minutes. */
  stagePhotoUrl(path: string): Promise<string> {
    return this.storage.createSignedReadUrl('private', path);
  }

  /** Ordered designs were published, so their images are in the public bucket. */
  designImageUrl(path: string | null): string | null {
    return path ? this.storage.publicUrl(path) : null;
  }
}
