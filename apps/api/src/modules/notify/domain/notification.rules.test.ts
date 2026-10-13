import { describe, expect, it } from 'vitest';
import {
  customerChannelsForStage,
  indianMobileDigits,
  MAX_ATTEMPTS,
  nextAttemptAfterFailure,
} from './notification.rules';

describe('retry schedule', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  it('backs off 1 min, 5 min, 30 min, 2 h, 6 h, then gives up', () => {
    const delays = [1, 2, 3, 4, 5].map((n) => (nextAttemptAfterFailure(n, now)!.getTime() - now.getTime()) / 60_000);
    expect(delays).toEqual([1, 5, 30, 120, 360]);
    expect(nextAttemptAfterFailure(MAX_ATTEMPTS, now)).toBeNull();
  });
});

describe('who hears about a stage change', () => {
  it('sends milestones to WhatsApp and every customer step to email + push', () => {
    expect(customerChannelsForStage('SPEC_APPROVED', 'PATTERN')).toEqual(['EMAIL', 'WHATSAPP', 'PUSH']);
    expect(customerChannelsForStage('PACKED', 'SHIPPED')).toEqual(['EMAIL', 'WHATSAPP', 'PUSH']);
    expect(customerChannelsForStage('PATTERN', 'CUTTING')).toEqual(['EMAIL', 'PUSH']);
    expect(customerChannelsForStage('FINISHING', 'PACKED')).toEqual(['EMAIL', 'PUSH']);
  });

  it('keeps workshop-internal steps quiet for customers', () => {
    expect(customerChannelsForStage('QC', 'FINISHING')).toEqual([]);
    expect(customerChannelsForStage('QC', 'CUTTING')).toEqual([]);
    expect(customerChannelsForStage('CUTTING', 'ON_HOLD')).toEqual([]);
    expect(customerChannelsForStage('ON_HOLD', 'CUTTING')).toEqual([]);
    expect(customerChannelsForStage('ON_HOLD', 'CANCELLED')).toEqual(['EMAIL', 'WHATSAPP', 'PUSH']);
  });

  it('keeps QC send-backs to stitching internal', () => {
    expect(customerChannelsForStage('QC', 'STITCHING')).toEqual([]);
  });
});

describe('indianMobileDigits', () => {
  it('normalises the formats people type and Supabase stores', () => {
    for (const input of ['+91 98765 43210', '919876543210', '09876543210', '9876543210']) {
      expect(indianMobileDigits(input)).toBe('9876543210');
    }
    expect(indianMobileDigits('12345')).toBeNull();
    expect(indianMobileDigits('5876543210')).toBeNull();
    expect(indianMobileDigits(null)).toBeNull();
  });
});
