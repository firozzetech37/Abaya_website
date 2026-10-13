import { z } from 'zod';
import type { Role } from './enums';

/**
 * FASHN credit usage per person (admin "FASHN usage" page). Website previews and try-ons are
 * counted for the customer who asked; Studio jobs (AI Catalog, Make with AI) for the staff member
 * who started them. Days are India days (IST); `from` and `to` are both included.
 */
export const FASHN_USAGE_MAX_DAYS = 366;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const fashnUsageQuery = z
  .object({ from: isoDay, to: isoDay })
  .refine((q) => q.from <= q.to, { message: 'The start date must be on or before the end date', path: ['from'] })
  .refine((q) => daysBetween(q.from, q.to) < FASHN_USAGE_MAX_DAYS, {
    message: `Pick at most ${FASHN_USAGE_MAX_DAYS} days`,
    path: ['to'],
  });
export type FashnUsageQuery = z.infer<typeof fashnUsageQuery>;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (YYYY-MM-DD); 0 for the same day. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The India calendar date (YYYY-MM-DD) of an instant. */
export function indiaDate(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `days` India days before `date` (YYYY-MM-DD); negative goes forward. */
export function shiftIndiaDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

/** The instants an India-day range covers: [since, until). */
export function indiaDayRange(from: string, to: string): { since: Date; until: Date } {
  return {
    since: new Date(Date.parse(`${from}T00:00:00Z`) - IST_OFFSET_MS),
    until: new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS - IST_OFFSET_MS),
  };
}

export type FashnUsageAudience = 'CUSTOMER' | 'STAFF';
/** Staff hold any role besides CUSTOMER. */
export const usageAudience = (roles: readonly Role[]): FashnUsageAudience =>
  roles.some((r) => r !== 'CUSTOMER') ? 'STAFF' : 'CUSTOMER';

export interface FashnUsageUserDto {
  userId: string;
  /** null when the account was deleted. */
  name: string | null;
  email: string | null;
  audience: FashnUsageAudience;
  roles: Role[];
  previews: number;
  tryOns: number;
  studioJobs: number;
  /** Requests that ended without a picture (failed ones cost nothing, except a preview that failed the accuracy check twice). */
  failed: number;
  /** Automatic remakes after the accuracy check (website) and retries of a Studio image. */
  remakes: number;
  credits: number;
  /** `credits` split: website previews and try-ons, and Studio jobs. */
  websiteCredits: number;
  studioCredits: number;
  /** Website only (the "Credits by customer" table): failed, remakes and last request; null when none. */
  websiteFailed: number;
  websiteRemakes: number;
  websiteLastUsedAt: string | null;
  lastUsedAt: string;
}

export interface FashnUsageTotalsDto {
  /** Website previews and try-ons. */
  website: number;
  /** Studio jobs. */
  studio: number;
  total: number;
}

export interface FashnUsageReportDto {
  from: string;
  to: string;
  totals: FashnUsageTotalsDto;
  /** Everyone who used FASHN in the range, most credits first. */
  users: FashnUsageUserDto[];
}

export interface FashnUsageSummaryDto {
  today: FashnUsageTotalsDto;
  last7Days: FashnUsageTotalsDto;
  thisMonth: FashnUsageTotalsDto;
  /** The shop's daily credit cap for website previews and try-ons. */
  websiteDailyLimit: number;
  /** Each staff member's daily credit cap in the Studio. */
  staffDailyLimit: number;
  /** Credits left on the FASHN account; null in test mode or when FASHN did not answer. */
  balance: number | null;
  live: boolean;
}

export type FashnUsageSource = 'PREVIEW' | 'TRYON' | 'STUDIO';

export interface FashnUsageJobDto {
  id: string;
  source: FashnUsageSource;
  /** Studio only: the FASHN job kind and view (e.g. PRODUCT_TO_MODEL, FRONT). */
  kind: string | null;
  view: string | null;
  designId: string | null;
  designName: string | null;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  credits: number;
  remakes: number;
  /** Short-lived link to the picture; always null for try-ons (her own photo stays private). */
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface FashnUsageJobsDto {
  userId: string;
  /** Newest first, at most FASHN_USAGE_JOBS_LIMIT. */
  items: FashnUsageJobDto[];
  /** True when there were more jobs than listed. */
  more: boolean;
}
export const FASHN_USAGE_JOBS_LIMIT = 200;
