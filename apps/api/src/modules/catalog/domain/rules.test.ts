import { describe, expect, it } from 'vitest';
import type { Role } from '@abaya/contracts';
import { fromPrice } from './from-price';
import { isNewArrival } from './new-arrival';
import { ReferenceRules } from './reference.entity';
import { slugify, uniqueSlug } from './slug';

const MANAGER = { userId: 'm', roles: ['CATALOG_MANAGER'] as Role[] };
const DESIGNER = { userId: 'd', roles: ['DESIGNER'] as Role[] };

describe('fromPrice', () => {
  const groups = [
    { code: 'FABRIC' as const, isRequired: true },
    { code: 'COLOUR' as const, isRequired: true },
    { code: 'ADD_ON' as const, isRequired: false },
  ];

  it('adds default choices', () => {
    expect(
      fromPrice(249900, groups, [
        { groupCode: 'FABRIC', surchargeInPaise: 60000, isDefault: true },
        { groupCode: 'FABRIC', surchargeInPaise: 0, isDefault: false },
        { groupCode: 'COLOUR', surchargeInPaise: 0, isDefault: true },
      ]),
    ).toBe(309900);
  });

  it('uses the cheapest option of a required group without a default', () => {
    expect(
      fromPrice(100000, groups, [
        { groupCode: 'FABRIC', surchargeInPaise: 30000, isDefault: false },
        { groupCode: 'FABRIC', surchargeInPaise: 20000, isDefault: false },
      ]),
    ).toBe(120000);
  });

  it('ignores optional groups without defaults', () => {
    expect(fromPrice(100000, groups, [{ groupCode: 'ADD_ON', surchargeInPaise: 49900, isDefault: false }])).toBe(100000);
  });
});

describe('ReferenceRules', () => {
  it('only lets catalog managers review', () => {
    expect(() => ReferenceRules.assertManualTransition(DESIGNER, 'IMPORTED', 'IN_REVIEW', null)).toThrow(/catalog manager/);
    expect(() => ReferenceRules.assertManualTransition(MANAGER, 'IMPORTED', 'IN_REVIEW', null)).not.toThrow();
  });

  it('requires an assigned designer before NEEDS_DESIGN', () => {
    expect(() => ReferenceRules.assertManualTransition(MANAGER, 'IN_REVIEW', 'NEEDS_DESIGN', null)).toThrow(/Assign a designer/);
    expect(() => ReferenceRules.assertManualTransition(MANAGER, 'IN_REVIEW', 'NEEDS_DESIGN', 'd')).not.toThrow();
  });

  it('never marks DESIGNED by hand and rejects unknown transitions', () => {
    expect(() => ReferenceRules.assertManualTransition(MANAGER, 'NEEDS_DESIGN', 'DESIGNED', 'd')).toThrow(/original design/);
    expect(() => ReferenceRules.assertManualTransition(MANAGER, 'REJECTED', 'IN_REVIEW', null)).toThrow(/cannot move/);
  });

  it('lets only the assigned designer (or a manager) design from a NEEDS_DESIGN reference', () => {
    expect(() => ReferenceRules.assertCanDesignFrom(DESIGNER, 'NEEDS_DESIGN', 'd')).not.toThrow();
    expect(() => ReferenceRules.assertCanDesignFrom(DESIGNER, 'NEEDS_DESIGN', 'someone-else')).toThrow(/another designer/);
    expect(() => ReferenceRules.assertCanDesignFrom(MANAGER, 'IN_REVIEW', 'd')).toThrow(/not waiting/);
  });

  it('shows designers only their assigned references', () => {
    expect(ReferenceRules.canView(DESIGNER, 'd')).toBe(true);
    expect(ReferenceRules.canView(DESIGNER, 'x')).toBe(false);
    expect(ReferenceRules.canView(MANAGER, null)).toBe(true);
  });
});

describe('slugs', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('Eid Lace Butterfly Abaya!')).toBe('eid-lace-butterfly-abaya');
    expect(slugify('  Crème  Nida  ')).toBe('creme-nida');
    expect(slugify('A')).toBe('design-a');
  });

  it('appends a number when taken', async () => {
    const taken = new Set(['nida', 'nida-2']);
    expect(await uniqueSlug('nida', async (s) => taken.has(s))).toBe('nida-3');
  });
});

describe('isNewArrival', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it('is true for designs published within the last 30 days', () => {
    expect(isNewArrival(daysAgo(0), now)).toBe(true);
    expect(isNewArrival(daysAgo(29), now)).toBe(true);
  });

  it('is false from the 30th day on, and for unpublished designs', () => {
    expect(isNewArrival(daysAgo(30), now)).toBe(false);
    expect(isNewArrival(daysAgo(200), now)).toBe(false);
    expect(isNewArrival(null, now)).toBe(false);
  });
});
