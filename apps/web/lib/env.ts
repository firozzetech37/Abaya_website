/** Public runtime config. Everything has a safe default so the site builds with nothing set. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

/** A real Clerk key: not empty and not the `pk_test_...` placeholder from .env.example. */
const isRealKey = (key: string | undefined, prefix: 'pk' | 'sk'): boolean =>
  typeof key === 'string' && key.startsWith(`${prefix}_`) && key.length > 20 && !key.includes('...');

/** True when login can work in the browser. ClerkProvider is mounted only then. */
export const isClerkConfigured = (): boolean => isRealKey(CLERK_PUBLISHABLE_KEY, 'pk');

/**
 * Server-only: true when clerkMiddleware can verify sessions (it needs the secret key too).
 * Without it the middleware lets every request through and account pages rely on the client guard.
 */
export const isClerkServerConfigured = (): boolean =>
  isClerkConfigured() && isRealKey(process.env.CLERK_SECRET_KEY, 'sk');

/** Where Clerk's combined sign-in / sign-up lives. */
export const LOGIN_PATH = '/login';
