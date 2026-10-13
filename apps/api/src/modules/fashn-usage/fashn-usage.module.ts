import { Module } from '@nestjs/common';
import { AiCatalogModule } from '../ai-catalog/ai-catalog.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { TryOnModule } from '../try-on/try-on.module';
import { FashnUsageService } from './application/fashn-usage.service';
import { FashnUsageController } from './interface/fashn-usage.controller';

/**
 * Admin "FASHN usage" (docs/apps/admin.md): FASHN credits per person. Owns no tables; asks the
 * try-on, AI catalog, catalog and identity modules through their exported services.
 */
@Module({
  imports: [TryOnModule, AiCatalogModule, CatalogModule, IdentityModule],
  controllers: [FashnUsageController],
  providers: [FashnUsageService],
})
export class FashnUsageModule {}
