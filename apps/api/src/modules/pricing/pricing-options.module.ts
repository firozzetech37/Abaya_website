import { Module } from '@nestjs/common';
import { AdminOptionsService } from './application/admin-options.service';
import { OptionCatalogService } from './application/option-catalog.service';
import { OPTION_CATALOG_REPOSITORY } from './application/ports/option-catalog.repository';
import { PrismaOptionCatalogRepository } from './infrastructure/prisma-option-catalog.repository';
import { AdminOptionsController } from './interface/pricing.controllers';

/**
 * Pricing, part 1: the option catalog (groups, values, size bands). It has no
 * module dependencies, so catalog can import it without a cycle.
 */
@Module({
  controllers: [AdminOptionsController],
  providers: [
    OptionCatalogService,
    AdminOptionsService,
    { provide: OPTION_CATALOG_REPOSITORY, useClass: PrismaOptionCatalogRepository },
  ],
  exports: [OptionCatalogService],
})
export class PricingOptionsModule {}
