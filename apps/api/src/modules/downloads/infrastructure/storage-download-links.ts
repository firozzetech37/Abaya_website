import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../common/storage/object-storage';
import type { DownloadLinks } from '../application/ports/downloads.ports';

@Injectable()
export class StorageDownloadLinks implements DownloadLinks {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  signed(path: string, fileName: string, expiresInSeconds: number) {
    return this.storage.createSignedReadUrl('private', path, expiresInSeconds, fileName);
  }
}
