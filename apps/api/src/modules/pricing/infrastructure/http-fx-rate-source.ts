import { DISPLAY_CURRENCIES, type DisplayCurrency } from '@abaya/contracts';
import type { FxRateSource } from '../application/ports/fx-rate.source';

const TIMEOUT_MS = 5_000;

/** The open.er-api.com feed (free, no key, updated daily): `{ result, rates: { AED, SAR, … } }`. */
export class HttpFxRateSource implements FxRateSource {
  constructor(private readonly url: string) {}

  async fetchRates(): Promise<Record<DisplayCurrency, number>> {
    const res = await fetch(this.url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Exchange-rate feed answered ${res.status}`);
    const body = (await res.json()) as { result?: string; rates?: Record<string, unknown> };
    if (body.result !== 'success') throw new Error('Exchange-rate feed did not succeed');
    const out = {} as Record<DisplayCurrency, number>;
    for (const code of DISPLAY_CURRENCIES) {
      const rate = Number(body.rates?.[code]);
      // One rupee is a few fils / halalas; anything outside this band is a broken feed, not a market move.
      if (!Number.isFinite(rate) || rate < 0.01 || rate > 0.2) throw new Error(`Exchange-rate feed gave no usable ${code} rate`);
      out[code] = rate;
    }
    return out;
  }
}

/** Tests and servers without the feed: always unreachable, so the configured fallback rates are used. */
export class NoFxRateSource implements FxRateSource {
  fetchRates(): Promise<Record<DisplayCurrency, number>> {
    return Promise.reject(new Error('Live exchange rates are off'));
  }
}
