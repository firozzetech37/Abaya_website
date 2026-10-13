import { describe, expect, it } from 'vitest';
import { assertReadyForCutting, bodyMeasurements, mayEditPattern, suggestPattern } from './pattern.rules';

describe('pattern rules', () => {
  it('lets the technician who took the job (or a manager) edit while at PATTERN', () => {
    const base = { stage: 'PATTERN' as const, claimedById: 'me', actorId: 'me' };
    expect(mayEditPattern({ ...base, roles: ['PATTERN_TECHNICIAN'] })).toBe(true);
    expect(mayEditPattern({ ...base, roles: ['PATTERN_TECHNICIAN'], claimedById: 'other' })).toBe(false);
    expect(mayEditPattern({ ...base, roles: ['PRODUCTION_MANAGER'], claimedById: 'other' })).toBe(true);
    expect(mayEditPattern({ ...base, roles: ['CUTTER'] })).toBe(false);
    expect(mayEditPattern({ ...base, stage: 'CUTTING', roles: ['PATTERN_TECHNICIAN'] })).toBe(false);
  });

  it('prefers the approved tech pack measurements, then the order, and prefills ease and pieces', () => {
    const body = bodyMeasurements({ bustCm: 94, fullLengthCm: 138 }, { bustCm: 92, hipCm: 100, notes: 'x' });
    expect(body).toEqual({ bustCm: 94, fullLengthCm: 138, hipCm: 100 });
    const s = suggestPattern({ style: 'CLOSED', body, options: [] });
    expect(s.measurements.find((m) => m.key === 'bustCm')).toEqual({ key: 'bustCm', bodyCm: 94, easeCm: 12, finishedCm: 106 });
    expect(s.measurements.find((m) => m.key === 'wristCm')).toMatchObject({ bodyCm: null, finishedCm: null });
    expect(s.pieces.map((p) => p.name)).toEqual(['Front', 'Back', 'Sleeve']);
  });

  it('refuses to send an incomplete pattern to cutting', () => {
    expect(() => assertReadyForCutting(null)).toThrow(/Save the pattern/);
    expect(() =>
      assertReadyForCutting({
        measurements: [],
        pieces: [],
        fabricWidthCm: null,
        fabricLengthCm: null,
        liningLengthCm: null,
        seamAllowanceMm: 10,
        notes: '',
        files: [],
      }),
    ).toThrow(/measurements, pieces, fabric, files/);
  });
});
