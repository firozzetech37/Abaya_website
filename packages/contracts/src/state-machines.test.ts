import { describe, expect, it } from 'vitest';
import { DESIGN_STATUSES, PRODUCTION_STAGES, REFERENCE_STATUSES } from './enums';
import {
  canTransitionDesign,
  canTransitionReference,
  canTransitionStage,
  DESIGN_TRANSITIONS,
  PRODUCTION_TRANSITIONS,
  REFERENCE_TRANSITIONS,
} from './state-machines';

describe('design transitions', () => {
  it('covers every status', () => {
    expect(Object.keys(DESIGN_TRANSITIONS).sort()).toEqual([...DESIGN_STATUSES].sort());
  });

  it('cannot publish straight from review or draft', () => {
    expect(canTransitionDesign('IN_REVIEW', 'PUBLISHED')).toBe(false);
    expect(canTransitionDesign('DRAFT', 'PUBLISHED')).toBe(false);
  });

  it('follows the happy path', () => {
    expect(canTransitionDesign('DRAFT', 'IN_REVIEW')).toBe(true);
    expect(canTransitionDesign('IN_REVIEW', 'PRICED')).toBe(true);
    expect(canTransitionDesign('PRICED', 'PUBLISHED')).toBe(true);
    expect(canTransitionDesign('PUBLISHED', 'ARCHIVED')).toBe(true);
  });
});

describe('reference transitions', () => {
  it('covers every status and makes DESIGNED/REJECTED final', () => {
    expect(Object.keys(REFERENCE_TRANSITIONS).sort()).toEqual([...REFERENCE_STATUSES].sort());
    expect(REFERENCE_TRANSITIONS.DESIGNED).toEqual([]);
    expect(canTransitionReference('REJECTED', 'IN_REVIEW')).toBe(false);
  });
});

describe('production transitions', () => {
  it('covers every stage', () => {
    expect(Object.keys(PRODUCTION_TRANSITIONS).sort()).toEqual([...PRODUCTION_STAGES].sort());
  });

  it('walks through every workshop station in order', () => {
    const path = ['PLACED', 'SPEC_APPROVED', 'PATTERN', 'CUTTING', 'STITCHING', 'QC', 'FINISHING', 'PACKED', 'SHIPPED', 'DELIVERED'] as const;
    for (let i = 1; i < path.length; i++) expect(canTransitionStage(path[i - 1]!, path[i]!)).toBe(true);
    // No skipping a station.
    expect(canTransitionStage('CUTTING', 'QC')).toBe(false);
    expect(canTransitionStage('QC', 'PACKED')).toBe(false);
    expect(canTransitionStage('FINISHING', 'SHIPPED')).toBe(false);
  });

  it('lets QC send an item back to the station that caused the problem, and nothing else goes backwards', () => {
    for (const back of ['STITCHING', 'CUTTING', 'PATTERN'] as const) expect(canTransitionStage('QC', back)).toBe(true);
    expect(canTransitionStage('FINISHING', 'STITCHING')).toBe(false);
    expect(canTransitionStage('CUTTING', 'PATTERN')).toBe(false);
  });

  it('puts pattern and cutting work on hold and back, and never enters the old ASSIGNED stage', () => {
    expect(canTransitionStage('PATTERN', 'ON_HOLD')).toBe(true);
    expect(canTransitionStage('ON_HOLD', 'PATTERN')).toBe(true);
    expect(canTransitionStage('STITCHING', 'ON_HOLD')).toBe(true); // tailor reports a problem
    expect(canTransitionStage('QC', 'ON_HOLD')).toBe(false);
    for (const from of PRODUCTION_STAGES) expect(canTransitionStage(from, 'ASSIGNED')).toBe(false);
  });

  it('cannot cancel after shipping or skip stages', () => {
    expect(canTransitionStage('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canTransitionStage('PLACED', 'CUTTING')).toBe(false);
    expect(canTransitionStage('PACKED', 'CANCELLED')).toBe(true);
    expect(canTransitionStage('CANCELLED', 'PLACED')).toBe(false);
  });
});

describe('workshop stations', () => {
  it('maps every station stage to exactly one station', async () => {
    const { STATION_STAGES, WORKSHOP_STATIONS, stationForStage } = await import('./enums');
    const seen = WORKSHOP_STATIONS.flatMap((s) => STATION_STAGES[s]);
    expect(new Set(seen).size).toBe(seen.length);
    expect(stationForStage('SPEC_APPROVED')).toBe('pattern');
    expect(stationForStage('PACKED')).toBe('logistics');
    expect(stationForStage('PLACED')).toBeNull();
  });

  it('sends each person to the right home after sign-in', async () => {
    const { staffHomePath, stationsForRoles } = await import('./enums');
    expect(staffHomePath(['CATALOG_MANAGER'])).toBe('/');
    expect(staffHomePath(['CUTTER'])).toBe('/workshop/cutting');
    expect(staffHomePath(['MAKER', 'CUSTOMER'])).toBe('/workshop/stitching');
    expect(staffHomePath(['QC', 'FINISHER'])).toBe('/workshop');
    expect(staffHomePath(['PRODUCTION_MANAGER', 'CUTTER'])).toBe('/');
    expect(staffHomePath(['CUSTOMER'])).toBeNull();
    expect(staffHomePath(['DESIGNER'])).toBe('/studio');
    expect(staffHomePath(['DESIGNER', 'CATALOG_MANAGER'])).toBe('/');
    expect(stationsForRoles(['PRODUCTION_MANAGER'])).toHaveLength(6);
  });
});

describe('customer order tracking', () => {
  it('folds workshop-internal stages into the steps customers see', async () => {
    const { CUSTOMER_STAGE_FLOW, customerStage, PRODUCTION_STAGES } = await import('./enums');
    for (const s of PRODUCTION_STAGES) {
      if (s !== 'CANCELLED') expect(CUSTOMER_STAGE_FLOW).toContain(customerStage(s));
    }
    expect(customerStage('FINISHING')).toBe('QC');
    expect(customerStage('ON_HOLD')).toBe('PATTERN');
    expect(customerStage('PACKED')).toBe('PACKED');
  });
});

describe('payment not completed', () => {
  it('is a closed checkout that was never paid, not a real cancellation', async () => {
    const { isPaymentNotCompleted } = await import('./enums');
    expect(isPaymentNotCompleted({ status: 'CANCELLED', placedAt: null })).toBe(true);
    expect(isPaymentNotCompleted({ status: 'CANCELLED', placedAt: '2026-09-28T10:00:00Z' })).toBe(false);
    expect(isPaymentNotCompleted({ status: 'PENDING_PAYMENT', placedAt: null })).toBe(false);
    expect(isPaymentNotCompleted({ status: 'PAID', placedAt: '2026-09-28T10:00:00Z' })).toBe(false);
  });
});
