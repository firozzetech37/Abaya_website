import { Inject, Injectable } from '@nestjs/common';
import type { AdminCollectionDto } from '@abaya/contracts';
import { AlreadyExistsError, NotFoundError } from '../../../common/errors/domain-error';
import { UploadsService } from '../../media/application/uploads.service';
import {
  CATALOG_IMAGE_STORAGE,
  type CatalogImageStorage,
  COLLECTION_REPOSITORY,
  type CollectionInput,
  type CollectionRecord,
  type CollectionRepository,
} from './ports/catalog.ports';

/** CATALOG_MANAGER: collections (e.g. "Ramadan 2027"), which designs they contain, and their home-page video. */
@Injectable()
export class CollectionsService {
  constructor(
    @Inject(COLLECTION_REPOSITORY) private readonly collections: CollectionRepository,
    @Inject(CATALOG_IMAGE_STORAGE) private readonly images: CatalogImageStorage,
    private readonly uploads: UploadsService,
  ) {}

  private toDto({ publishedDesignCount: _p, cover: _cover, previews: _v, ...c }: CollectionRecord): AdminCollectionDto {
    return { ...c, videoUrl: c.videoPath ? this.images.publicUrl(c.videoPath) : null };
  }

  /** A newly chosen video must be an upload made for this purpose; customers then read it from the public bucket. */
  private async publishVideo(input: CollectionInput, current: string | null): Promise<void> {
    if (!input.videoPath || input.videoPath === current) return;
    this.uploads.assertPath('COLLECTION_VIDEO', input.videoPath);
    await this.images.publishFile(input.videoPath);
  }

  async list(): Promise<AdminCollectionDto[]> {
    return (await this.collections.list(false)).map((c) => this.toDto(c));
  }

  async create(input: CollectionInput & { slug: string; name: string }): Promise<AdminCollectionDto> {
    if (await this.collections.findBySlug(input.slug)) {
      throw new AlreadyExistsError('A collection with this URL already exists.');
    }
    await this.publishVideo(input, null);
    return this.toDto(await this.collections.create(input));
  }

  async update(id: string, input: CollectionInput): Promise<AdminCollectionDto> {
    const existing = await this.collections.findById(id);
    if (!existing) throw new NotFoundError('Collection');
    if (input.slug && input.slug !== existing.slug && (await this.collections.findBySlug(input.slug))) {
      throw new AlreadyExistsError('A collection with this URL already exists.');
    }
    await this.publishVideo(input, existing.videoPath);
    return this.toDto(await this.collections.update(id, input));
  }
}
