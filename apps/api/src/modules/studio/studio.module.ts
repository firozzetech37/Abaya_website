import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../common/config/config.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { OrdersModule } from '../orders/orders.module';
import { GenerationWorker } from './application/generation-worker.service';
import { GenerationService } from './application/generation.service';
import { PinterestService } from './application/pinterest.service';
import { IMAGE_GENERATOR, PINTEREST_CLIENT, STUDIO_FILES, STUDIO_REPOSITORY } from './application/ports/studio.ports';
import { StudioService } from './application/studio.service';
import { GeminiImageGenerator } from './infrastructure/gemini-image-generator';
import { HttpPinterestClient } from './infrastructure/http-pinterest-client';
import { PrismaStudioRepository } from './infrastructure/prisma-studio.repository';
import { StorageStudioFiles } from './infrastructure/storage-studio-files';
import { TestImageGenerator } from './infrastructure/test-image-generator';
import { StudioController } from './interface/studio.controller';

/**
 * Designer Studio: AI design (Nano Banana, or placeholder images until GEMINI_API_KEY is set)
 * and Pinterest inspiration (view and link only). Designs it makes go through the catalog.
 */
@Module({
  imports: [CatalogModule, OrdersModule, MediaModule],
  controllers: [StudioController],
  providers: [
    StudioService,
    GenerationService,
    GenerationWorker,
    PinterestService,
    { provide: STUDIO_REPOSITORY, useClass: PrismaStudioRepository },
    { provide: STUDIO_FILES, useClass: StorageStudioFiles },
    {
      provide: IMAGE_GENERATOR,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.AI_IMAGE_PROVIDER === 'gemini' && config.GEMINI_API_KEY
          ? new GeminiImageGenerator(config.GEMINI_API_KEY, config.AI_IMAGE_MODEL)
          : new TestImageGenerator(),
    },
    { provide: PINTEREST_CLIENT, useClass: HttpPinterestClient },
  ],
})
export class StudioModule {}
