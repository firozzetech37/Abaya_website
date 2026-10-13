import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FxRatesDto } from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { FX_RATE_SOURCE, type FxRateSource } from './ports/fx-rate.source';

/** A live rate is reused this long; the feed itself only changes once a day. */
const TTL_MS = 6 * 60 * 60_000;
/** After a failed fetch, wait this long before asking the feed again (serving the last rate or the fallback meanwhile). */
const RETRY_MS = 10 * 60_000;

/**
 * Today's INR → AED and INR → SAR rates for the website's display currency. Fetched from the feed at most every
 * few hours and kept in memory; when the feed is unreachable the last good rate is served, and
 * before any has been fetched the configured fallback is. Nothing is ever charged in AED.
 */
@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name);
  private cached: FxRatesDto | null = null;
  private nextFetchAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(
    @Inject(FX_RATE_SOURCE) private readonly source: FxRateSource,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'FX_AED_PER_INR' | 'FX_SAR_PER_INR'>,
  ) {}

  async rates(now = new Date()): Promise<FxRatesDto> {
    if (now.getTime() >= this.nextFetchAt) {
      this.inflight ??= this.refresh(now).finally(() => {
        this.inflight = null;
      });
      // The first caller waits for the feed; later callers reuse the last rate while it refreshes.
      if (!this.cached) await this.inflight;
    }
    return this.cached ?? this.fallback(now);
  }

  private async refresh(now: Date): Promise<void> {
    try {
      const rates = await this.source.fetchRates();
      this.cached = { base: 'INR', rates, fetchedAt: now.toISOString(), source: 'live' };
      this.nextFetchAt = now.getTime() + TTL_MS;
    } catch (e) {
      this.logger.warn({ err: e instanceof Error ? e.message : e }, 'Exchange-rate feed unavailable; using the last rate or the fallback');
      this.nextFetchAt = now.getTime() + RETRY_MS;
    }
  }

  private fallback(now: Date): FxRatesDto {
    return { base: 'INR', rates: { AED: this.config.FX_AED_PER_INR, SAR: this.config.FX_SAR_PER_INR }, fetchedAt: now.toISOString(), source: 'fallback' };
  }
}
