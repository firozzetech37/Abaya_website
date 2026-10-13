import { describe, expect, it } from 'vitest';
import { ABAYA_STYLES } from './enums';
import {
  DEFAULT_EASE_CM,
  defaultPieces,
  finishedCm,
  missingForCutting,
  PATTERN_POINTS,
  type PatternBody,
  patternBody,
  suggestFabricLengthCm,
} from './pattern';

const complete: PatternBody = {
  measurements: [
    { key: 'bustCm', bodyCm: 92, easeCm: 12 },
    { key: 'fullLengthCm', bodyCm: 138, easeCm: 2 },
  ],
  pieces: [{ name: 'Front', count: 1 }],
  fabricWidthCm: 150,
  fabricLengthCm: 360,
  liningLengthCm: null,
  seamAllowanceMm: 10,
  notes: '',
  files: [{ path: 'pattern-files/2026/09/x.pdf', name: 'v1.pdf', contentType: 'application/pdf' }],
};

describe('pattern', () => {
  it('has default ease for every style and point', () => {
    for (const style of ABAYA_STYLES) expect(Object.keys(DEFAULT_EASE_CM[style]).sort()).toEqual([...PATTERN_POINTS].sort());
  });

  it('adds ease to the body measurement, to the nearest half centimetre', () => {
    expect(finishedCm(92, 12)).toBe(104);
    expect(finishedCm(58.3, 1)).toBe(59.5);
    expect(finishedCm(58, -2)).toBe(56);
  });

  it('starts the piece list from the style and adds pieces for chosen options', () => {
    const pieces = defaultPieces('CLOSED', [
      { groupCode: 'SLEEVE', valueName: 'Buttoned cuff' },
      { groupCode: 'CLOSURE', valueName: 'Belted' },
      { groupCode: 'ADD_ON', valueName: 'Matching hijab' },
    ]);
    expect(pieces.map((p) => p.name)).toEqual(['Front', 'Back', 'Sleeve', 'Cuff', 'Belt', 'Matching hijab']);
    expect(defaultPieces('BUTTERFLY', []).map((p) => p.name)).not.toContain('Sleeve');
  });

  it('suggests more fabric for narrow widths and wide styles', () => {
    const base = { fullLengthCm: 140, sleeveLengthCm: 59 };
    const closedWide = suggestFabricLengthCm({ ...base, style: 'CLOSED', fabricWidthCm: 150 });
    const closedNarrow = suggestFabricLengthCm({ ...base, style: 'CLOSED', fabricWidthCm: 110 });
    const kaftanNarrow = suggestFabricLengthCm({ ...base, style: 'KAFTAN', fabricWidthCm: 110 });
    expect(closedWide).toBe(360); // 280 + 20 + 59 → 359 → 360
    expect(closedNarrow).toBeGreaterThan(closedWide);
    expect(kaftanNarrow).toBeGreaterThan(closedNarrow);
    expect(closedWide % 10).toBe(0);
  });

  it('lists what is missing before a pattern can go to cutting', () => {
    expect(missingForCutting(complete)).toEqual([]);
    expect(
      missingForCutting({ ...complete, measurements: [{ key: 'bustCm', bodyCm: 92, easeCm: 12 }], pieces: [], fabricLengthCm: null, files: [] }),
    ).toEqual(['measurements', 'pieces', 'fabric', 'files']);
  });

  it('validates the saved pattern', () => {
    expect(patternBody.safeParse(complete).success).toBe(true);
    expect(patternBody.safeParse({ ...complete, files: [{ ...complete.files[0], contentType: 'application/zip' }] }).success).toBe(false);
    expect(patternBody.safeParse({ ...complete, pieces: [{ name: 'Front', count: 0 }] }).success).toBe(false);
  });
});
