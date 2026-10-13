import { isClerkAPIResponseError } from '@clerk/expo';

/** True when a Clerk error (returned or thrown) carries the given API error code. */
export function hasClerkCode(e: unknown, code: string): boolean {
  return isClerkAPIResponseError(e) && e.errors.some((x) => x.code === code);
}

/** Human-readable text from a Clerk error, or the fallback. */
export function clerkMessage(e: unknown, fallback: string): string {
  if (isClerkAPIResponseError(e)) {
    const first = e.errors[0];
    return first?.longMessage || first?.message || fallback;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
