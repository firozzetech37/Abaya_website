import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../common/storage/object-storage';
import type { CatalogImageStorage } from '../application/ports/catalog.ports';

/** Seed images start in the public bucket (packages/db/prisma/seed.ts); previews keep a private original. */
const isSeedPath = (path: string) => path.startsWith('seed/');
const isExternalUrl = (path: string) => /^https?:\/\//i.test(path);

@Injectable()
export class StorageCatalogImages implements CatalogImageStorage {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  publicUrl(storagePath: string, version?: number): string {
    const url = this.storage.publicUrl(storagePath);
    return version ? `${url}?v=${version}` : url;
  }

  async adminUrl(storagePath: string): Promise<string> {
    if (isSeedPath(storagePath)) return this.storage.publicUrl(storagePath);
    return this.storage.createSignedReadUrl('private', storagePath);
  }

  async referenceUrl(imagePath: string): Promise<string> {
    return isExternalUrl(imagePath) ? imagePath : this.storage.createSignedReadUrl('private', imagePath);
  }

  swatchUrl(path: string | null): string | null {
    return path ? this.storage.publicUrl(path) : null;
  }

  publishFile(storagePath: string): Promise<void> {
    return this.storage.copy('private', 'public', storagePath);
  }
}
