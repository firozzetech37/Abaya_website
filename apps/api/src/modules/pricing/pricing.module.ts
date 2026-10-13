import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../common/config/config.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FxRateService } from './application/fx-rate.service';
import { FX_RATE_SOURCE } from './application/ports/fx-rate.source';
import { PricingService } from './application/pricing.service';
import { HttpFxRateSource, NoFxRateSource } from './infrastructure/http-fx-rate-source';
import { PricingController } from './interface/pricing.controllers';
import { PricingOptionsModule } from './pricing-options.module';

/** Pricing, part 2: quotes, and the display-currency rate (INR → AED). Needs the design (catalog) and the option catalog. */
@Module({
  imports: [CatalogModule, PricingOptionsModule],
  controllers: [PricingController],
  providers: [
    PricingService,
    FxRateService,
    {
      provide: FX_RATE_SOURCE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => (config.FX_LIVE_ENABLED ? new HttpFxRateSource(config.FX_RATE_URL) : new NoFxRateSource()),
    },
  ],
  exports: [PricingService, FxRateService],
})
export class PricingModule {}
