import { describe, expect, it } from 'vitest';
import {
  assertAssignable,
  assertQcAllowed,
  assertReadyToShip,
  assertTechPackEditable,
  draftTechPack,
} from './production.rules';

describe('QC rules', () => {
  const ok = [{ item: 'Length', ok: true }];
  it('refuses a second result after a pass (the item is waiting to ship)', () => {
    expect(() => assertQcAllowed('QC', { result: 'PASS', checklist: ok }, 'PASS')).toThrow(/already passed/);
    expect(() => assertQcAllowed('QC', { result: 'PASS', checklist: ok }, 'FAIL')).not.toThrow();
  });

  it('only records QC for items in QC', () => {
    expect(() => assertQcAllowed('STITCHING', { result: 'PASS', checklist: ok })).toThrow(/quality check first/);
  });
  it('needs every line ticked to pass, and notes to fail', () => {
    expect(() => assertQcAllowed('QC', { result: 'PASS', checklist: [{ item: 'Length', ok: false }] })).toThrow(/Every checklist/);
    expect(() => assertQcAllowed('QC', { result: 'FAIL', checklist: ok })).toThrow(/Explain/);
    expect(() => assertQcAllowed('QC', { result: 'FAIL', checklist: ok, notes: 'Hem uneven' })).not.toThrow();
    expect(() => assertQcAllowed('QC', { result: 'PASS', checklist: ok })).not.toThrow();
  });
});

describe('tech pack, assignment and shipping rules', () => {
  it('edits tech packs only before approval and while PLACED', () => {
    expect(() => assertTechPackEditable('PLACED', false)).not.toThrow();
    expect(() => assertTechPackEditable('PLACED', true)).toThrow(/already approved/);
    expect(() => assertTechPackEditable('PATTERN', false)).toThrow(/before production/);
  });

  it('assigns a tailor any time from tech-pack approval until stitching is done', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const later = new Date('2026-10-10T00:00:00Z');
    for (const stage of ['SPEC_APPROVED', 'PATTERN', 'CUTTING', 'STITCHING', 'ON_HOLD', 'REMAKE'] as const) {
      expect(() => assertAssignable({ stage, makerActive: true, dueDate: later, now })).not.toThrow();
    }
    // The team (tailor included) is picked before the tech pack is approved.
    expect(() => assertAssignable({ stage: 'PLACED', makerActive: true, dueDate: later, now })).not.toThrow();
    expect(() => assertAssignable({ stage: 'QC', makerActive: true, dueDate: later, now })).toThrow(/already been stitched/);
    expect(() => assertAssignable({ stage: 'SPEC_APPROVED', makerActive: false, dueDate: later, now })).toThrow(/not active/);
    expect(() => assertAssignable({ stage: 'SPEC_APPROVED', makerActive: true, dueDate: now, now })).toThrow(/future/);
  });

  it('ships only packed items that passed QC', () => {
    expect(() => assertReadyToShip('PACKED', 'PASS')).not.toThrow();
    expect(() => assertReadyToShip('PACKED', 'FAIL')).toThrow();
    expect(() => assertReadyToShip('PACKED', null)).toThrow();
    expect(() => assertReadyToShip('FINISHING', 'PASS')).toThrow();
    expect(() => assertReadyToShip('QC', 'PASS')).toThrow();
  });
});

describe('draftTechPack', () => {
  const options = [
    { groupCode: 'FABRIC' as const, groupName: 'Fabric', valueId: '1', valueName: 'Satin', surchargeInPaise: 0 },
    { groupCode: 'EMBELLISHMENT' as const, groupName: 'Embellishment', valueId: '2', valueName: 'Piping', surchargeInPaise: 0 },
    { groupCode: 'EMBELLISHMENT' as const, groupName: 'Embellishment', valueId: '3', valueName: 'Cuff embroidery', surchargeInPaise: 0 },
  ];

  it('uses the customer measurements when made to measure', () => {
    const pack = draftTechPack({
      style: 'BUTTERFLY',
      options,
      sizeBandCode: 'CUSTOM',
      measurements: { bustCm: 92, fullLengthCm: 138, profileName: 'Me', notes: 'Loose fit please' },
    });
    expect(pack.measurements).toEqual({ bustCm: 92, fullLengthCm: 138 });
    expect(pack.fabric).toBe('Satin');
    expect(pack.embellishments).toBe('Piping, Cuff embroidery');
    expect(pack.constructionNotes).toContain('Loose fit please');
  });

  it('falls back to the size chart for standard sizes', () => {
    expect(draftTechPack({ style: 'CLOSED', options, sizeBandCode: 'M', measurements: null }).measurements.fullLengthCm).toBe(138);
  });
});
