import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { CatalogQueryService } from '../application/catalog-query.service';
import { ContentTranslationService } from '../application/content-translation.service';
import { textsToTranslate } from '../domain/content-localise';

/** The fields the public catalog routes translate (see the controllers). */
export const CATALOG_TEXT_FIELDS = ['name', 'collectionName', 'description', 'alt'];

/**
 * At start-up, every live design, its options and the collections are queued for Arabic in the
 * background, so the Arabic site rarely waits for a translation.
 */
@Injectable()
export class ContentTranslationWarmup implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContentTranslationWarmup.name);

  constructor(
    private readonly catalog: CatalogQueryService,
    private readonly translations: ContentTranslationService,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'NODE_ENV'>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.NODE_ENV === 'test') return;
    void this.run().catch((e: unknown) => this.logger.warn({ err: e instanceof Error ? e.message : e }, 'Could not queue catalog translations'));
  }

  async run(): Promise<number> {
    const fields = new Set(CATALOG_TEXT_FIELDS);
    const texts: string[] = [];
    texts.push(...textsToTranslate(await this.catalog.listCollections(), fields));
    let cursor: string | undefined;
    do {
      const page = await this.catalog.list({ limit: 50, sort: 'newest', cursor } as Parameters<CatalogQueryService['list']>[0]);
      texts.push(...textsToTranslate(page.items, fields));
      for (const card of page.items) {
        texts.push(...textsToTranslate(await this.catalog.getBySlug(card.slug), fields));
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const unique = [...new Set(texts)];
    this.translations.warm(unique, 'ar');
    return unique.length;
  }
}
