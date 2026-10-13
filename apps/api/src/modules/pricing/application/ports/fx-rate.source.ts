import type { DisplayCurrency } from '@abaya/contracts';

/** Where today's INR → AED / SAR rates come from (a free feed in infrastructure/, nothing in tests). */
export interface FxRateSource {
  /** Units of each display currency per rupee. Throws when the feed is unreachable or answers nonsense. */
  fetchRates(): Promise<Record<DisplayCurrency, number>>;
}
export const FX_RATE_SOURCE = Symbol('FX_RATE_SOURCE');
