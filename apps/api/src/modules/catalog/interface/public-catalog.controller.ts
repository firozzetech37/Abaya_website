import { TranslateFields } from '../../../common/i18n/translate-fields';
import { CATALOG_TEXT_FIELDS } from './content-translation-warmup';
import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  type AnnouncementDto,
  type CollectionDto,
  type DesignCard,
  type DesignDetail,
  type DesignFacets,
  type DesignFacetsQuery,
  designFacetsQuery,
  type ListDesignsQuery,
  listDesignsQuery,
  type Paginated,
} from '@abaya/contracts';
import { Public } from '../../../common/auth/decorators';
import { ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { AnnouncementsService } from '../application/announcements.service';
import { CatalogQueryService } from '../application/catalog-query.service';

/** Storefront catalog. Only PUBLISHED designs are ever returned. */
@Public()
@Controller()
export class PublicCatalogController {
  constructor(
    private readonly catalog: CatalogQueryService,
    private readonly bar: AnnouncementsService,
  ) {}

  /** The top-bar messages live right now, in the page's language (`?lang=ar`). */
  @Get('announcements')
  @Header('Cache-Control', 'public, max-age=60')
  announcements(@Query('lang') lang?: string): Promise<AnnouncementDto[]> {
    return this.bar.live(lang === 'ar' ? 'ar' : 'en');
  }

  @Get('designs')
  @TranslateFields(...CATALOG_TEXT_FIELDS)
  list(@ZodQuery(listDesignsQuery) query: ListDesignsQuery): Promise<Paginated<DesignCard>> {
    return this.catalog.list(query);
  }

  /** Filter counts for the shop page (declared before designs/:slug so "facets" is never a slug). */
  @Get('designs/facets')
  @TranslateFields('name')
  facets(@ZodQuery(designFacetsQuery) query: DesignFacetsQuery): Promise<DesignFacets> {
    return this.catalog.facets(query);
  }

  @Get('designs/:slug')
  @TranslateFields(...CATALOG_TEXT_FIELDS)
  get(@Param('slug') slug: string): Promise<DesignDetail> {
    return this.catalog.getBySlug(slug);
  }

  @Get('collections')
  @TranslateFields(...CATALOG_TEXT_FIELDS)
  collections(): Promise<CollectionDto[]> {
    return this.catalog.listCollections();
  }

  @Get('collections/:slug')
  @TranslateFields(...CATALOG_TEXT_FIELDS)
  collection(@Param('slug') slug: string): Promise<CollectionDto> {
    return this.catalog.getCollection(slug);
  }
}
