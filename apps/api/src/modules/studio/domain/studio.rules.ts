/**
 * Studio rules (docs/apps/studio.md). Plain TypeScript.
 */

/** Generations count against the daily limit from midnight India time. */
export function startOfIndiaDay(now: Date): Date {
  const IST_OFFSET_MS = 5.5 * 3_600_000;
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - IST_OFFSET_MS);
}

/** A failed generation is retried twice, waiting a little longer each time. */
export const MAX_GENERATION_ATTEMPTS = 3;
export const retryDelayMs = (attempt: number): number => 20_000 * attempt;

/** How long one worker may hold a generation before another may take it over. */
export const GENERATION_LEASE_MS = 5 * 60_000;

/** The pin id inside a Pinterest pin URL (null for short pin.it links before they are resolved). */
export function pinIdFromUrl(url: string): string | null {
  return /\/pin\/(?:[\w-]*--)?(\d+)/.exec(url)?.[1] ?? null;
}
