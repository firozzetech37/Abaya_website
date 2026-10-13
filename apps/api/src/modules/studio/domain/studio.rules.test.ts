import { describe, expect, it } from 'vitest';
import { pinIdFromUrl, retryDelayMs, startOfIndiaDay } from './studio.rules';

describe('studio rules', () => {
  it('starts the daily limit at midnight India time', () => {
    // 2026-10-03 01:00 IST is 2026-10-02 19:30 UTC; the day began 2026-10-02 18:30 UTC.
    expect(startOfIndiaDay(new Date('2026-10-02T19:30:00Z')).toISOString()).toBe('2026-10-02T18:30:00.000Z');
    expect(startOfIndiaDay(new Date('2026-10-02T17:00:00Z')).toISOString()).toBe('2026-10-01T18:30:00.000Z');
  });

  it('reads pin ids from pin links', () => {
    expect(pinIdFromUrl('https://www.pinterest.com/pin/123456789012/')).toBe('123456789012');
    expect(pinIdFromUrl('https://in.pinterest.com/pin/elegant-abaya--987654321/')).toBe('987654321');
    expect(pinIdFromUrl('https://pin.it/3xYz')).toBeNull();
  });

  it('waits longer before each retry', () => {
    expect(retryDelayMs(2)).toBeGreaterThan(retryDelayMs(1));
  });
});
