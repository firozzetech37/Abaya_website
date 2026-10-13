/**
 * Pure helpers for the "FASHN usage" page: date presets (India days), search, audience filter,
 * sorting, and the CSV export. No React here, so they are unit-tested.
 */
import { type FashnUsageUserDto, indiaDate, shiftIndiaDate } from '@abaya/contracts';

export type RangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';
export type AudienceFilter = 'ALL' | 'CUSTOMER' | 'STAFF';
export type SortKey =
  | 'name'
  | 'previews'
  | 'tryOns'
  | 'studioJobs'
  | 'failed'
  | 'remakes'
  | 'credits'
  | 'lastUsedAt'
  | 'websiteCredits'
  | 'websiteFailed'
  | 'websiteRemakes'
  | 'websiteLastUsedAt';
export interface Sort {
  key: SortKey;
  desc: boolean;
}

/** The India-day range of a preset; `custom` keeps the dates given. */
export function rangeFor(preset: RangePreset, now: Date, custom?: { from: string; to: string }): { from: string; to: string } {
  const today = indiaDate(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: shiftIndiaDate(today, 6), to: today };
    case '30d':
      return { from: shiftIndiaDate(today, 29), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'custom':
      return custom ?? { from: today, to: today };
  }
}

/** The range of a preset as of now (kept out of components: reading the clock is not pure). */
export const currentRange = (preset: RangePreset, custom?: { from: string; to: string }) => rangeFor(preset, new Date(), custom);

/** Today's India date, for the custom date pickers' defaults and upper bound. */
export const todayInIndia = (): string => indiaDate(new Date());

/** Saves the CSV in the browser. */
export function downloadCsv(csv: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** People who used the website (previews or try-ons) in the period: the "Credits by customer" table. */
export const websiteRows = (rows: FashnUsageUserDto[]): FashnUsageUserDto[] => rows.filter((r) => r.previews + r.tryOns > 0);

export function filterRows(rows: FashnUsageUserDto[], audience: AudienceFilter, search: string): FashnUsageUserDto[] {
  const q = search.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (audience === 'ALL' || r.audience === audience) &&
      (!q || (r.name ?? '').toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)),
  );
}

export function sortRows(rows: FashnUsageUserDto[], sort: Sort): FashnUsageUserDto[] {
  const value = (r: FashnUsageUserDto): string | number =>
    sort.key === 'name' ? (r.name ?? r.email ?? '').toLowerCase() : (r[sort.key] ?? '');
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    // Ties: most credits first, so the order is stable and useful.
    return (sort.desc ? -order : order) || b.credits - a.credits;
  });
}

/** Clicking the sorted column flips it; a new column starts high-to-low (A to Z for names). */
export const nextSort = (current: Sort, key: SortKey): Sort =>
  current.key === key ? { key, desc: !current.desc } : { key, desc: key !== 'name' };

const cell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  // Quote anything with a comma, quote or line break; a leading =, +, - or @ is defused for spreadsheets.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const CSV_HEADER = ['Name', 'Email', 'Type', 'Roles', 'Previews', 'Try-ons', 'Studio jobs', 'Failed', 'Remakes', 'Credits', 'Last used (UTC)'];

export function usageCsv(rows: FashnUsageUserDto[]): string {
  const lines = rows.map((r) =>
    [
      r.name,
      r.email,
      r.audience === 'STAFF' ? 'Staff' : 'Customer',
      r.roles.join(' '),
      r.previews,
      r.tryOns,
      r.studioJobs,
      r.failed,
      r.remakes,
      r.credits,
      r.lastUsedAt,
    ]
      .map(cell)
      .join(','),
  );
  return [CSV_HEADER.join(','), ...lines].join('\r\n') + '\r\n';
}
