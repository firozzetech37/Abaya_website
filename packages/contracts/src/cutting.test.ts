import { describe, expect, it } from 'vitest';
import { cuttingBody, fabricVariancePercent, isFabricOveruse, missingForStitching } from './cutting';

const pattern = {
  pieces: [
    { name: 'Front', count: 1 },
    { name: 'Sleeve', count: 2 },
  ],
  fabricLengthCm: 360,
};
const done = {
  fabricLot: 'CR-NAVY-0925-03',
  colourConfirmed: true,
  fabricUsedCm: 380,
  wastageCm: 20,
  liningUsedCm: null,
  pieces: [
    { name: 'Front', count: 1, cut: true },
    { name: 'Sleeve', count: 2, cut: true },
  ],
  notes: '',
  photoPath: 'stage-photos/2026/09/x.jpg',
};

describe('cutting', () => {
  it('compares fabric used with the pattern estimate', () => {
    expect(fabricVariancePercent(380, 360)).toBe(6);
    expect(fabricVariancePercent(340, 360)).toBe(-6);
    expect(fabricVariancePercent(380, null)).toBeNull();
    expect(isFabricOveruse(414, 360)).toBe(false); // exactly +15%
    expect(isFabricOveruse(420, 360)).toBe(true);
    expect(isFabricOveruse(999, null)).toBe(false);
  });

  it('is ready only when every pattern piece is cut, with lot, colour, metres and photo', () => {
    expect(missingForStitching(done, pattern)).toEqual([]);
    expect(
      missingForStitching(
        { ...done, fabricLot: ' ', colourConfirmed: false, pieces: [{ name: 'Front', count: 1, cut: true }], photoPath: null },
        pattern,
      ),
    ).toEqual(['lot', 'colour', 'pieces', 'photo']);
  });

  it('asks for a note when far more fabric than estimated was used', () => {
    expect(missingForStitching({ ...done, fabricUsedCm: 450 }, pattern)).toEqual(['overuseNote']);
    expect(missingForStitching({ ...done, fabricUsedCm: 450, notes: 'Flaw in roll, recut front' }, pattern)).toEqual([]);
  });

  it('validates the request', () => {
    expect(cuttingBody.safeParse(done).success).toBe(true);
    expect(cuttingBody.safeParse({ ...done, fabricUsedCm: 0 }).success).toBe(false);
    expect(cuttingBody.safeParse({ ...done, photoPath: '' }).success).toBe(false);
  });
});
