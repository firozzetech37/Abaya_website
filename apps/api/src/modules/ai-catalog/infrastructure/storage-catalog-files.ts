import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../common/storage/object-storage';
import type { CatalogFiles } from '../application/ports/catalog.ports';

/** AI Catalog inputs and results live in the private bucket. */
@Injectable()
export class StorageCatalogFiles implements CatalogFiles {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  signedUrl(path: string, expiresInSeconds?: number) {
    return this.storage.createSignedReadUrl('private', path, expiresInSeconds);
  }

  read(path: string) {
    return this.storage.get('private', path);
  }

  write(path: string, data: Buffer, contentType: string) {
    return this.storage.put('private', path, data, contentType);
  }
}
