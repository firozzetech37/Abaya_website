import { APP_INTERCEPTOR } from '@nestjs/core';
import { CONTENT_TRANSLATION_REPOSITORY, ContentTranslationService } from './application/content-translation.service';
import { PrismaContentTranslationRepository } from './infrastructure/prisma-content-translation.repository';
import { ContentTranslationInterceptor } from './interface/content-translation.interceptor';
import { ContentTranslationWarmup } from './interface/content-translation-warmup';
import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../common/config/config.module';
import { PreviewRefreshOnStart } from './interface/preview-refresh';
import { AiModule } from '../ai/ai.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { PricingOptionsModule } from '../pricing/pricing-options.module';
import { CatalogAiSync } from './application/catalog-ai-sync';
import { CatalogQueryService } from './application/catalog-query.service';
import { CatalogService } from './application/catalog.service';
import { AnnouncementsService } from './application/announcements.service';
import { CollectionsService } from './application/collections.service';
import { DesignsAdminService } from './application/designs-admin.service';
import {
  ANNOUNCEMENT_REPOSITORY,
  TRANSLATOR,
  CATALOG_IMAGE_STORAGE,
  COLLECTION_REPOSITORY,
  DESIGN_REPOSITORY,
  REFERENCE_REPOSITORY,
} from './application/ports/catalog.ports';
import { ReferencesService } from './application/references.service';
import {
  PrismaCollectionRepository,
  PrismaReferenceRepository,
} from './infrastructure/prisma-collection-reference.repositories';
import { PrismaAnnouncementRepository } from './infrastructure/prisma-announcement.repository';
import { FallbackTranslator, GeminiTranslator, MyMemoryTranslator, TestTranslator } from './infrastructure/translators';
import { PrismaDesignRepository } from './infrastructure/prisma-design.repository';
import { StorageCatalogImages } from './infrastructure/storage-catalog-images';
import {
  AdminAnnouncementsController,
  AdminCollectionsController,
  AdminDesignsController,
  AdminReferencesController,
} from './interface/admin-catalog.controllers';
import { PublicCatalogController } from './interface/public-catalog.controller';

@Module({
  imports: [PricingOptionsModule, MediaModule, IdentityModule, AiModule],
  controllers: [
    AdminAnnouncementsController,
    PublicCatalogController, AdminDesignsController, AdminCollectionsController, AdminReferencesController],
  providers: [
    CatalogService,
    CatalogQueryService,
    DesignsAdminService,
    CollectionsService,
    AnnouncementsService,
    ReferencesService,
    CatalogAiSync,
    PreviewRefreshOnStart,
    ContentTranslationService,
    ContentTranslationWarmup,
    { provide: CONTENT_TRANSLATION_REPOSITORY, useClass: PrismaContentTranslationRepository },
    { provide: APP_INTERCEPTOR, useClass: ContentTranslationInterceptor },
    { provide: DESIGN_REPOSITORY, useClass: PrismaDesignRepository },
    { provide: COLLECTION_REPOSITORY, useClass: PrismaCollectionRepository },
    { provide: ANNOUNCEMENT_REPOSITORY, useClass: PrismaAnnouncementRepository },
    {
      provide: TRANSLATOR,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.NODE_ENV === 'test'
          ? new TestTranslator()
          : config.GEMINI_API_KEY
            ? new FallbackTranslator(new GeminiTranslator(config.GEMINI_API_KEY, config.GEMINI_TEXT_MODEL), new MyMemoryTranslator())
            : new MyMemoryTranslator(),
    },
    { provide: REFERENCE_REPOSITORY, useClass: PrismaReferenceRepository },
    { provide: CATALOG_IMAGE_STORAGE, useClass: StorageCatalogImages },
  ],
  exports: [CatalogService, DesignsAdminService, ReferencesService],
})
export class CatalogModule {}
