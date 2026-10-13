import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../common/config/config.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { CatalogWorker } from './application/catalog-worker.service';
import { CatalogService } from './application/catalog.service';
import {
  CATALOG_FILES,
  CATALOG_REPOSITORY,
  FASHN_CLIENT,
  IMAGE_DESCRIBER,
} from './application/ports/catalog.ports';
import { GeminiImageDescriber, NoImageDescriber } from './infrastructure/gemini-image-describer';
import { HttpFashnClient } from './infrastructure/http-fashn-client';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository';
import { StorageCatalogFiles } from './infrastructure/storage-catalog-files';
import { TestFashnClient } from './infrastructure/test-fashn-client';
import { CatalogController } from './interface/catalog.controller';

/**
 * AI Catalog: FASHN on-model catalog photos for the Studio (test mode until FASHN_API_KEY is
 * set). Owns CatalogModelProfile, CatalogJob and CatalogImage; adds photos to designs only
 * through the catalog module's service.
 */
@Module({
  imports: [CatalogModule, MediaModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    CatalogWorker,
    { provide: CATALOG_REPOSITORY, useClass: PrismaCatalogRepository },
    { provide: CATALOG_FILES, useClass: StorageCatalogFiles },
    {
      provide: FASHN_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.FASHN_API_KEY ? new HttpFashnClient(config.FASHN_API_KEY) : new TestFashnClient(),
    },
    {
      provide: IMAGE_DESCRIBER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.GEMINI_API_KEY
          ? new GeminiImageDescriber(config.GEMINI_API_KEY, config.GEMINI_TEXT_MODEL)
          : new NoImageDescriber(),
    },
  ],
  // The website's AI preview and try-on use the same FASHN account.
  exports: [FASHN_CLIENT, CatalogService],
})
export class AiCatalogModule {}
