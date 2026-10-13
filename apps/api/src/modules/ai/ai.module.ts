import { Module } from '@nestjs/common';
import { AiWorker } from './application/ai-worker.service';
import { AiService } from './application/ai.service';
import { AI_REPOSITORY, IMAGE_ANALYZER, IMAGE_URL_SIGNER } from './application/ports/ai.ports';
import { SimilarityIndex } from './application/similarity-index';
import { HttpImageAnalyzer } from './infrastructure/http-image-analyzer';
import { PrismaAiRepository } from './infrastructure/prisma-ai.repository';
import { StorageImageSigner } from './infrastructure/storage-image-signer';
import { AdminAiController } from './interface/admin-ai.controller';

/**
 * AI assistant (Step 15): CLIP fingerprints for duplicate detection and tag
 * suggestions from the Python service in services/ai. Knows images only by id;
 * the catalog module calls AiService when images are added or removed.
 */
@Module({
  controllers: [AdminAiController],
  providers: [
    AiService,
    AiWorker,
    SimilarityIndex,
    { provide: AI_REPOSITORY, useClass: PrismaAiRepository },
    { provide: IMAGE_ANALYZER, useClass: HttpImageAnalyzer },
    { provide: IMAGE_URL_SIGNER, useClass: StorageImageSigner },
  ],
  exports: [AiService],
})
export class AiModule {}
