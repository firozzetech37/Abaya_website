import { describe, expect, it } from 'vitest';
import { missingForQc, selfCheckLevel, stitchingBody, stitchingChecklist } from './stitching';

describe('stitching', () => {
  it('builds the checklist from the tech pack and pattern', () => {
    const lines = stitchingChecklist({
      techPack: { closure: 'Buttons ×6', embellishments: 'Lace trim, Cuff embroidery', addOns: 'Matching hijab' },
      pieces: [{ name: 'Front' }, { name: 'Sleeve' }, { name: 'Cuff' }],
      finishedLengthCm: 140,
    });
    expect(lines.map((l) => l.label)).toEqual([
      'Body assembled, seams finished',
      'Sleeves attached',
      'Cuffs attached',
      'Closure: Buttons ×6',
      'Lace trim',
      'Cuff embroidery',
      'Matching hijab',
      'Hem finished at 140 cm',
    ]);
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
    // A butterfly abaya has no separate sleeves or closure.
    expect(stitchingChecklist({ techPack: null, pieces: [{ name: 'Body (full width)' }], finishedLengthCm: null }).map((l) => l.key)).toEqual([
      'assembly',
      'hem',
    ]);
  });

  it('grades the self-check: within 1 cm ok, up to 2 cm a warning, beyond that off', () => {
    expect(selfCheckLevel(140.5, 140)).toBe('ok');
    expect(selfCheckLevel(141.5, 140)).toBe('warn');
    expect(selfCheckLevel(137.5, 140)).toBe('off');
  });

  it('is ready for QC only with every line ticked, the measurements and a photo; far off needs a note', () => {
    const checklist = [
      { key: 'assembly', label: 'x' },
      { key: 'hem', label: 'y' },
    ];
    const targets = { fullLengthCm: 140, bustCm: 106 };
    const body = {
      checklist: [
        { key: 'assembly', done: true },
        { key: 'hem', done: true },
      ],
      measurements: [
        { key: 'fullLengthCm' as const, measuredCm: 140.5 },
        { key: 'bustCm' as const, measuredCm: 106 },
      ],
      notes: '',
      photoPath: 'stage-photos/x.jpg',
    };
    expect(missingForQc(body, { checklist, targets })).toEqual([]);
    expect(missingForQc({ ...body, checklist: [{ key: 'assembly', done: true }], measurements: [], photoPath: null }, { checklist, targets })).toEqual([
      'checklist',
      'measurements',
      'photo',
    ]);
    const off = { ...body, measurements: [{ key: 'fullLengthCm' as const, measuredCm: 136 }, body.measurements[1]!] };
    expect(missingForQc(off, { checklist, targets })).toEqual(['offNote']);
    expect(missingForQc({ ...off, notes: 'Customer asked for a shorter hem' }, { checklist, targets })).toEqual([]);
    expect(stitchingBody.safeParse(body).success).toBe(true);
  });
});
