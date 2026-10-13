import { describe, expect, it } from 'vitest';
import {
  classifyMatch,
  combineSuggestions,
  cosine,
  findMatches,
  hashDistance,
  type IndexedImage,
  mergeTags,
  nextAttemptAfterFailure,
  sanitizeTags,
} from './similarity';

const T = { duplicate: 0.96, similar: 0.93, hashDistance: 4 };

/** Unit vector pointing mostly along `axis`, tilted by `tilt` towards axis+1 (cosine = cos(tilt)). */
function vec(axis: number, tilt = 0, dims = 8): Float32Array {
  const v = new Float32Array(dims);
  v[axis % dims] = Math.cos(tilt);
  v[(axis + 1) % dims] = Math.sin(tilt);
  return v;
}

const img = (over: Partial<IndexedImage> & Pick<IndexedImage, 'subjectId'>): IndexedImage => ({
  kind: 'DESIGN_IMAGE',
  designId: over.subjectId,
  vector: vec(0),
  phash: null,
  ...over,
});

describe('similarity scores', () => {
  it('uses the dot product of unit vectors and refuses mixed models', () => {
    expect(cosine(vec(0), vec(0))).toBeCloseTo(1);
    expect(cosine(vec(0), vec(2))).toBeCloseTo(0);
    expect(cosine(vec(0), vec(0, Math.acos(0.95)))).toBeCloseTo(0.95);
    expect(cosine(vec(0, 0, 8), vec(0, 0, 4))).toBe(0);
  });

  it('counts differing bits between perceptual hashes', () => {
    expect(hashDistance('ffffffffffffffff', 'ffffffffffffffff')).toBe(0);
    expect(hashDistance('ffffffffffffffff', 'fffffffffffffff0')).toBe(4);
    expect(hashDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hashDistance(null, 'ffffffffffffffff')).toBeNull();
    expect(hashDistance('not-a-hash', 'ffffffffffffffff')).toBeNull();
  });

  it('classifies duplicates, similar looks and unrelated images', () => {
    expect(classifyMatch(0.97, null, T)).toBe('DUPLICATE');
    expect(classifyMatch(0.95, null, T)).toBe('SIMILAR');
    // Same picture by hash, slightly different look (e.g. cropped): still a duplicate.
    expect(classifyMatch(0.94, 2, T)).toBe('DUPLICATE');
    // A matching hash alone is not enough: plain backgrounds can collide.
    expect(classifyMatch(0.8, 0, T)).toBeNull();
    expect(classifyMatch(0.92, null, T)).toBeNull();
  });
});

describe('findMatches', () => {
  it('keeps the best match per design, strongest first, and skips the design itself', () => {
    const own = [img({ subjectId: 'a1', designId: 'A', vector: vec(0) }), img({ subjectId: 'a2', designId: 'A', vector: vec(3) })];
    const candidates = [
      ...own,
      img({ subjectId: 'b1', designId: 'B', vector: vec(0, Math.acos(0.94)) }),
      img({ subjectId: 'b2', designId: 'B', vector: vec(3, Math.acos(0.99)) }), // B's best: duplicate of a2
      img({ subjectId: 'c1', designId: 'C', vector: vec(0, Math.acos(0.935)) }),
      img({ subjectId: 'd1', designId: 'D', vector: vec(5) }), // unrelated
      img({ kind: 'REFERENCE', subjectId: 'r1', designId: null, vector: vec(0, Math.acos(0.97)) }),
    ];
    const matches = findMatches(own, candidates, T, { kind: 'DESIGN', id: 'A' });
    expect(matches.map((m) => [m.owner.kind, m.owner.id, m.level])).toEqual([
      ['DESIGN', 'B', 'DUPLICATE'],
      ['REFERENCE', 'r1', 'DUPLICATE'],
      ['DESIGN', 'C', 'SIMILAR'],
    ]);
    expect(matches[0]!.score).toBeCloseTo(0.99, 2);
  });

  it('returns nothing without source vectors', () => {
    expect(findMatches([], [img({ subjectId: 'x' })], T, { kind: 'DESIGN', id: 'A' })).toEqual([]);
  });
});

describe('retries', () => {
  it('backs off and then gives up', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    expect(nextAttemptAfterFailure(1, now)!.getTime() - now.getTime()).toBe(30_000);
    expect(nextAttemptAfterFailure(5, now)!.getTime() - now.getTime()).toBe(6 * 60 * 60_000);
    expect(nextAttemptAfterFailure(6, now)).toBeNull();
  });
});

describe('suggestions', () => {
  it('only keeps well-formed tags from the AI service', () => {
    expect(
      sanitizeTags([
        { tag: 'black', group: 'colour', label: 'Black', score: 0.8 },
        { tag: 'Black Abaya', group: 'colour', label: 'x', score: 0.9 },
        { tag: 'black', group: 'colour', label: 'Black', score: 0.5 },
        { tag: 'lace-trim', score: 7 },
        'nonsense',
      ]),
    ).toEqual([
      { tag: 'black', group: 'colour', label: 'Black', score: 0.8 },
      { tag: 'lace-trim', group: 'other', label: 'lace-trim', score: 1 },
    ]);
    expect(sanitizeTags(null)).toEqual([]);
  });

  it('combines images, drops what the design already has, and prefers the primary alt text', () => {
    const tag = (t: string, score: number) => ({ tag: t, group: 'g', label: t, score });
    const combined = combineSuggestions(
      [
        { tags: [tag('black', 0.7), tag('embroidery', 0.66)], style: 'BUTTERFLY', styleScore: 0.55, altText: 'Side view', isPrimary: false },
        { tags: [tag('black', 0.9), tag('crepe', 0.7)], style: 'KIMONO', styleScore: 0.6, altText: 'Black kimono abaya', isPrimary: true },
      ],
      { tags: ['crepe'], style: 'CLOSED' },
    );
    expect(combined).toEqual({
      tags: [tag('black', 0.9), tag('embroidery', 0.66)],
      style: { value: 'KIMONO', score: 0.6 },
      altText: 'Black kimono abaya',
    });
    expect(combineSuggestions([{ tags: [tag('black', 0.9)], style: 'CLOSED', styleScore: 0.6, altText: null, isPrimary: true }], { tags: ['black'], style: 'CLOSED' })).toBeNull();
  });

  it('merges accepted tags without repeats, up to 15', () => {
    expect(mergeTags(['black', 'eid'], ['eid', 'lace-trim', ' '])).toEqual(['black', 'eid', 'lace-trim']);
    expect(mergeTags(Array.from({ length: 14 }, (_, i) => `t${i}`), ['x', 'y'])).toHaveLength(15);
  });
});
