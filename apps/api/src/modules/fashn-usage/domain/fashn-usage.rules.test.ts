import { describe, expect, it } from 'vitest';
import { mergeJobs, mergeUsage, summaryRanges, totalsOf, type UsagePerson } from './fashn-usage.rules';

const at = (iso: string) => new Date(iso);
const people = new Map<string, UsagePerson>([
  ['ana', { name: 'Ana', email: 'ana@example.com', roles: ['CUSTOMER'] }],
  ['dina', { name: 'Dina', email: 'dina@example.com', roles: ['DESIGNER'] }],
]);

describe('FASHN usage per person', () => {
  it('merges website and Studio usage into one row per person, most credits first', () => {
    const rows = mergeUsage(
      [
        { userId: 'ana', previews: 3, tryOns: 1, failed: 1, remakes: 1, credits: 5, lastUsedAt: at('2026-10-09T10:00:00Z') },
        { userId: 'dina', previews: 1, tryOns: 0, failed: 0, remakes: 0, credits: 1, lastUsedAt: at('2026-10-10T08:00:00Z') },
      ],
      [{ userId: 'dina', jobs: 4, failed: 1, remakes: 1, credits: 9, lastUsedAt: at('2026-10-09T12:00:00Z') }],
      people,
    );
    expect(rows.map((r) => r.userId)).toEqual(['dina', 'ana']);
    expect(rows[0]).toMatchObject({ audience: 'STAFF', previews: 1, studioJobs: 4, failed: 1, remakes: 1, credits: 10, websiteCredits: 1, studioCredits: 9, websiteFailed: 0, websiteRemakes: 0, websiteLastUsedAt: '2026-10-10T08:00:00.000Z', lastUsedAt: '2026-10-10T08:00:00.000Z' });
    expect(rows[1]).toMatchObject({ name: 'Ana', audience: 'CUSTOMER', previews: 3, tryOns: 1, studioJobs: 0, credits: 5 });
  });

  it('keeps the numbers of a deleted account, and counts a Studio user as staff', () => {
    const [row] = mergeUsage([], [{ userId: 'gone', jobs: 1, failed: 0, remakes: 0, credits: 2, lastUsedAt: at('2026-10-01T00:00:00Z') }], people);
    expect(row).toMatchObject({ userId: 'gone', name: null, email: null, audience: 'STAFF', credits: 2, websiteCredits: 0, websiteLastUsedAt: null });
  });

  it('adds up website and Studio credits', () => {
    expect(totalsOf([{ credits: 3 }, { credits: 2 }], [{ credits: 7 }])).toEqual({ website: 5, studio: 7, total: 12 });
    expect(totalsOf([], [])).toEqual({ website: 0, studio: 0, total: 0 });
  });

  it('uses India days for today, the last 7 days and this month', () => {
    // 20:00 UTC on 31 Oct is already 1 Nov in India
    expect(summaryRanges(at('2026-10-31T20:00:00Z'))).toEqual({
      today: { from: '2026-11-01', to: '2026-11-01' },
      last7Days: { from: '2026-10-26', to: '2026-11-01' },
      thisMonth: { from: '2026-11-01', to: '2026-11-01' },
    });
  });

  it('lists jobs newest first, names designs, and never shows a try-on picture', () => {
    const { items, more } = mergeJobs(
      [
        { id: 'p1', kind: 'PREVIEW', designId: 'd1', status: 'DONE', credits: 2, remakes: 0, thumbnailUrl: 'https://x/p1', createdAt: at('2026-10-09T10:00:00Z') },
        { id: 't1', kind: 'TRYON', designId: 'd1', status: 'DONE', credits: 1, remakes: 0, thumbnailUrl: 'https://x/t1', createdAt: at('2026-10-09T11:00:00Z') },
      ],
      [{ id: 's1', kind: 'EDIT', view: 'EDIT', designId: null, status: 'FAILED', credits: 0, remakes: 0, thumbnailUrl: null, createdAt: at('2026-10-09T12:00:00Z') }],
      new Map([['d1', 'Noor']]),
      2,
    );
    expect(items.map((j) => j.id)).toEqual(['s1', 't1']);
    expect(items[1]).toMatchObject({ source: 'TRYON', designName: 'Noor', thumbnailUrl: null });
    expect(items[0]).toMatchObject({ source: 'STUDIO', kind: 'EDIT', designName: null });
    expect(more).toBe(true);
  });
});
