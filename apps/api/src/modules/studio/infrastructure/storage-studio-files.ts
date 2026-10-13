import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../common/storage/object-storage';
import type { StudioFiles } from '../application/ports/studio.ports';

/** Studio files live in the private bucket; reads go through short-lived signed URLs. */
@Injectable()
export class StorageStudioFiles implements StudioFiles {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  read(path: string) {
    return this.storage.get('private', path);
  }

  write(path: string, data: Buffer, contentType: string) {
    return this.storage.put('private', path, data, contentType);
  }

  signedUrl(path: string) {
    return this.storage.createSignedReadUrl('private', path);
  }
}
