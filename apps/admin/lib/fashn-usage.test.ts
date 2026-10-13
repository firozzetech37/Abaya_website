import type { FashnUsageUserDto } from '@abaya/contracts';
import { describe, expect, it } from 'vitest';
import { filterRows, nextSort, rangeFor, sortRows, usageCsv, websiteRows } from './fashn-usage';

const row = (over: Partial<FashnUsageUserDto>): FashnUsageUserDto => ({
  userId: 'u',
  name: 'Ana',
  email: 'ana@example.com',
  audience: 'CUSTOMER',
  roles: ['CUSTOMER'],
  previews: 0,
  tryOns: 0,
  studioJobs: 0,
  failed: 0,
  remakes: 0,
  credits: 0,
  websiteCredits: 0,
  studioCredits: 0,
  websiteFailed: 0,
  websiteRemakes: 0,
  websiteLastUsedAt: null,
  lastUsedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

describe('FASHN usage page helpers', () => {
  it('turns presets into India-day ranges', () => {
    const now = new Date('2026-10-10T20:00:00Z'); // 11 Oct in India
    expect(rangeFor('today', now)).toEqual({ from: '2026-10-11', to: '2026-10-11' });
    expect(rangeFor('7d', now)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(rangeFor('30d', now)).toEqual({ from: '2026-09-12', to: '2026-10-11' });
    expect(rangeFor('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-11' });
    expect(rangeFor('custom', now, { from: '2026-01-01', to: '2026-01-31' })).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('keeps only people who used the website for the customer table', () => {
    const rows = [row({ userId: 'a', previews: 1 }), row({ userId: 'b', studioJobs: 3, audience: 'STAFF' }), row({ userId: 'c', tryOns: 1, audience: 'STAFF' })];
    expect(websiteRows(rows).map((r) => r.userId)).toEqual(['a', 'c']);
  });

  it('filters by type and by name or email', () => {
    const rows = [row({ userId: 'a' }), row({ userId: 'b', name: 'Dina', email: 'dina@shop.in', audience: 'STAFF' })];
    expect(filterRows(rows, 'STAFF', '').map((r) => r.userId)).toEqual(['b']);
    expect(filterRows(rows, 'ALL', 'SHOP.in').map((r) => r.userId)).toEqual(['b']);
    expect(filterRows(rows, 'CUSTOMER', 'dina')).toEqual([]);
  });

  it('sorts by any column, ties by credits', () => {
    const rows = [
      row({ userId: 'a', name: 'zara', previews: 2, credits: 1 }),
      row({ userId: 'b', name: 'Amal', previews: 2, credits: 9 }),
      row({ userId: 'c', name: null, email: 'm@x.in', previews: 5, credits: 3 }),
    ];
    expect(sortRows(rows, { key: 'previews', desc: true }).map((r) => r.userId)).toEqual(['c', 'b', 'a']);
    expect(sortRows(rows, { key: 'name', desc: false }).map((r) => r.userId)).toEqual(['b', 'c', 'a']);
    expect(sortRows([row({ userId: 'a', websiteLastUsedAt: null }), row({ userId: 'b', websiteLastUsedAt: '2026-10-02T00:00:00.000Z' })], { key: 'websiteLastUsedAt', desc: true }).map((r) => r.userId)).toEqual(['b', 'a']);
    expect(nextSort({ key: 'credits', desc: true }, 'credits')).toEqual({ key: 'credits', desc: false });
    expect(nextSort({ key: 'credits', desc: true }, 'name')).toEqual({ key: 'name', desc: false });
  });

  it('writes a CSV that spreadsheets read safely', () => {
    const csv = usageCsv([row({ name: 'Sara, "S"', credits: 4, roles: ['CUSTOMER'] }), row({ name: '=HYPERLINK("x")', audience: 'STAFF' })]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Name,Email,Type,Roles,Previews,Try-ons,Studio jobs,Failed,Remakes,Credits,Last used (UTC)');
    expect(lines[1]).toBe('"Sara, ""S""",ana@example.com,Customer,CUSTOMER,0,0,0,0,0,4,2026-10-01T00:00:00.000Z');
    expect(lines[2]?.startsWith(`"'=HYPERLINK(""x"")",`)).toBe(true);
  });
});
