/** Public runtime config. Everything must work (and build) with these unset. */
export const env = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, ''),
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
};

/**
 * Clerk is mounted only when a real publishable key is present. Without it the
 * app still builds and renders the "Login is not configured" state (and Clerk's
 * keyless mode is never triggered).
 */
export const isClerkConfigured = (): boolean => /^pk_(test|live)_\w+/.test(env.clerkPublishableKey);
