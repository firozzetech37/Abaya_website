import { describe, expect, it } from 'vitest';
import { daysBetween, fashnUsageQuery, indiaDate, indiaDayRange, shiftIndiaDate, usageAudience } from './fashn-usage';

describe('FASHN usage dates (India days)', () => {
  it('reads the India calendar date of an instant', () => {
    // 19:00 UTC is 00:30 the next day in India
    expect(indiaDate(new Date('2026-10-09T19:00:00Z'))).toBe('2026-10-10');
    expect(indiaDate(new Date('2026-10-09T18:00:00Z'))).toBe('2026-10-09');
  });

  it('covers whole India days, both ends included', () => {
    const { since, until } = indiaDayRange('2026-10-01', '2026-10-01');
    expect(since.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(until.toISOString()).toBe('2026-10-01T18:30:00.000Z');
    expect(indiaDayRange('2026-10-01', '2026-10-31').until.toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });

  it('shifts and counts days across months', () => {
    expect(shiftIndiaDate('2026-10-03', 6)).toBe('2026-09-27');
    expect(shiftIndiaDate('2026-10-03', -1)).toBe('2026-10-04');
    expect(daysBetween('2026-09-27', '2026-10-03')).toBe(6);
  });

  it('accepts a range up to a year, start before end', () => {
    expect(fashnUsageQuery.safeParse({ from: '2026-10-01', to: '2026-10-10' }).success).toBe(true);
    expect(fashnUsageQuery.safeParse({ from: '2026-10-10', to: '2026-10-01' }).success).toBe(false);
    expect(fashnUsageQuery.safeParse({ from: '2025-01-01', to: '2026-10-01' }).success).toBe(false);
    expect(fashnUsageQuery.safeParse({ from: '1 Oct', to: '2026-10-01' }).success).toBe(false);
  });

  it('counts anyone with a role besides CUSTOMER as staff', () => {
    expect(usageAudience(['CUSTOMER'])).toBe('CUSTOMER');
    expect(usageAudience([])).toBe('CUSTOMER');
    expect(usageAudience(['CUSTOMER', 'DESIGNER'])).toBe('STAFF');
  });
});
