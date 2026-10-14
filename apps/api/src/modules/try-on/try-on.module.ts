import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../common/config/config.module';
import { AiCatalogModule } from '../ai-catalog/ai-catalog.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { WatermarkModule } from '../watermark/watermark.module';
import { CUSTOMER_PREVIEW_REPOSITORY, FACE_KEEPER, PREVIEW_CHECKER, TRYON_FILES } from './application/ports/try-on.ports';
import { NoFaceKeeper, OnnxFaceKeeper } from './infrastructure/onnx-face-keeper';
import { GeminiPreviewChecker, NoPreviewChecker } from './infrastructure/gemini-preview-checker';
import { TryOnWorker } from './application/try-on-worker.service';
import { TryOnService } from './application/try-on.service';
import { PrismaCustomerPreviewRepository } from './infrastructure/prisma-customer-preview.repository';
import { StorageTryOnFiles } from './infrastructure/storage-try-on-files';
import { AdminCustomerPreviewsController, MyTryOnController } from './interface/try-on.controllers';

/**
 * Website AI preview ("Preview my design") and virtual try-on, with FASHN (test mode until
 * FASHN_API_KEY is set). Owns CustomerPreview; reads designs only through the catalog module.
 */
@Module({
  imports: [AiCatalogModule, CatalogModule, MediaModule, WatermarkModule],
  controllers: [MyTryOnController, AdminCustomerPreviewsController],
  providers: [
    TryOnService,
    TryOnWorker,
    { provide: CUSTOMER_PREVIEW_REPOSITORY, useClass: PrismaCustomerPreviewRepository },
    { provide: TRYON_FILES, useClass: StorageTryOnFiles },
    {
      provide: FACE_KEEPER,
      inject: [APP_CONFIG],
      // Off in tests (no model run): try-ons are shown as FASHN made them.
      useFactory: (config: AppConfig) => (config.NODE_ENV === 'test' ? new NoFaceKeeper() : new OnnxFaceKeeper()),
    },
    {
      provide: PREVIEW_CHECKER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.GEMINI_API_KEY ? new GeminiPreviewChecker(config.GEMINI_API_KEY, config.GEMINI_TEXT_MODEL) : new NoPreviewChecker(),
    },
  ],
  exports: [TryOnService],
})
export class TryOnModule {}
