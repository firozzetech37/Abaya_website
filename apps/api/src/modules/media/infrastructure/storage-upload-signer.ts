import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../common/storage/object-storage';
import type { PrivateFileStore, UploadUrlSigner } from '../application/uploads.service';

@Injectable()
export class StorageUploadSigner implements UploadUrlSigner, PrivateFileStore {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  signPrivateUpload(path: string) {
    return this.storage.createSignedUploadUrl('private', path);
  }

  read(path: string) {
    return this.storage.get('private', path);
  }

  write(path: string, body: Buffer, contentType: string) {
    return this.storage.put('private', path, body, contentType);
  }

  readPublic(path: string) {
    return this.storage.get('public', path);
  }

  writePublic(path: string, body: Buffer, contentType: string) {
    return this.storage.put('public', path, body, contentType);
  }

  remove(paths: string[]) {
    return this.storage.remove('private', paths);
  }
}
