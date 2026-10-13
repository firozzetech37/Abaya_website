/**
 * FASHN credit usage per person: website previews and try-ons (counted for the customer) and
 * Studio jobs (counted for the staff member), merged into one row per person. Plain TypeScript.
 */
import {
  type FashnUsageJobDto,
  type FashnUsageTotalsDto,
  type FashnUsageUserDto,
  indiaDate,
  type Role,
  shiftIndiaDate,
  usageAudience,
} from '@abaya/contracts';

export interface WebsiteUsage {
  userId: string;
  previews: number;
  tryOns: number;
  failed: number;
  remakes: number;
  credits: number;
  lastUsedAt: Date;
}

export interface StudioUsage {
  userId: string;
  jobs: number;
  failed: number;
  remakes: number;
  credits: number;
  lastUsedAt: Date;
}

export interface UsagePerson {
  name: string | null;
  email: string | null;
  roles: Role[];
}

/** One row per person, most credits first (then most recent). A deleted account keeps its numbers. */
export function mergeUsage(website: WebsiteUsage[], studio: StudioUsage[], people: Map<string, UsagePerson>): FashnUsageUserDto[] {
  const rows = new Map<string, FashnUsageUserDto>();
  const row = (userId: string): FashnUsageUserDto => {
    let r = rows.get(userId);
    if (!r) {
      const p = people.get(userId);
      const roles = p?.roles ?? [];
      r = {
        userId,
        name: p?.name ?? null,
        email: p?.email ?? null,
        audience: usageAudience(roles),
        roles,
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
        lastUsedAt: new Date(0).toISOString(),
      };
      rows.set(userId, r);
    }
    return r;
  };
  const later = (a: string, b: Date) => (b.toISOString() > a ? b.toISOString() : a);
  for (const w of website) {
    const r = row(w.userId);
    r.previews += w.previews;
    r.tryOns += w.tryOns;
    r.failed += w.failed;
    r.remakes += w.remakes;
    r.credits += w.credits;
    r.websiteCredits += w.credits;
    r.websiteFailed += w.failed;
    r.websiteRemakes += w.remakes;
    r.websiteLastUsedAt = later(r.websiteLastUsedAt ?? '', w.lastUsedAt);
    r.lastUsedAt = later(r.lastUsedAt, w.lastUsedAt);
  }
  for (const s of studio) {
    const r = row(s.userId);
    // Studio jobs are made by staff even if the account has since lost its roles.
    r.audience = 'STAFF';
    r.studioJobs += s.jobs;
    r.failed += s.failed;
    r.remakes += s.remakes;
    r.credits += s.credits;
    r.studioCredits += s.credits;
    r.lastUsedAt = later(r.lastUsedAt, s.lastUsedAt);
  }
  return [...rows.values()].sort((a, b) => b.credits - a.credits || b.lastUsedAt.localeCompare(a.lastUsedAt));
}

export function totalsOf(website: Pick<WebsiteUsage, 'credits'>[], studio: Pick<StudioUsage, 'credits'>[]): FashnUsageTotalsDto {
  const w = website.reduce((n, r) => n + r.credits, 0);
  const s = studio.reduce((n, r) => n + r.credits, 0);
  return { website: w, studio: s, total: w + s };
}

/** Today, the last 7 days (today included) and this calendar month, as India days. */
export function summaryRanges(now: Date): Record<'today' | 'last7Days' | 'thisMonth', { from: string; to: string }> {
  const today = indiaDate(now);
  return {
    today: { from: today, to: today },
    last7Days: { from: shiftIndiaDate(today, 6), to: today },
    thisMonth: { from: `${today.slice(0, 8)}01`, to: today },
  };
}

export interface WebsiteJob {
  id: string;
  kind: 'PREVIEW' | 'TRYON';
  designId: string;
  status: FashnUsageJobDto['status'];
  credits: number;
  remakes: number;
  thumbnailUrl: string | null;
  createdAt: Date;
}

export interface StudioJob {
  id: string;
  kind: string;
  view: string;
  designId: string | null;
  status: FashnUsageJobDto['status'];
  credits: number;
  remakes: number;
  thumbnailUrl: string | null;
  createdAt: Date;
}

/** Both kinds of job, newest first, cut to `limit`. A try-on never carries a picture. */
export function mergeJobs(
  website: WebsiteJob[],
  studio: StudioJob[],
  designNames: Map<string, string>,
  limit: number,
): { items: FashnUsageJobDto[]; more: boolean } {
  const all: FashnUsageJobDto[] = [
    ...website.map((j) => ({
      id: j.id,
      source: j.kind,
      kind: null,
      view: null,
      designId: j.designId,
      designName: designNames.get(j.designId) ?? null,
      status: j.status,
      credits: j.credits,
      remakes: j.remakes,
      thumbnailUrl: j.kind === 'TRYON' ? null : j.thumbnailUrl,
      createdAt: j.createdAt.toISOString(),
    })),
    ...studio.map((j) => ({
      id: j.id,
      source: 'STUDIO' as const,
      kind: j.kind,
      view: j.view,
      designId: j.designId,
      designName: j.designId ? (designNames.get(j.designId) ?? null) : null,
      status: j.status,
      credits: j.credits,
      remakes: j.remakes,
      thumbnailUrl: j.thumbnailUrl,
      createdAt: j.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return { items: all.slice(0, limit), more: all.length > limit };
}
