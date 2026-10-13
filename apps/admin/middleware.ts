import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { type NextFetchEvent, type NextRequest, NextResponse } from 'next/server';

/** /login and its Clerk sub-steps (verification code, second factor, sign-up continuation). */
const isPublicRoute = createRouteMatcher(['/login(.*)']);

const clerkConfigured =
  /^pk_(test|live)_\w+/.test(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '') &&
  /^sk_(test|live)_\w+/.test(process.env.CLERK_SECRET_KEY ?? '');

const withClerk = clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) await auth.protect();
  },
  { signInUrl: '/login' },
);

/**
 * Every page needs a Clerk session except /login. Without Clerk keys (local builds,
 * CI) protection is skipped entirely: the console layout then sends visitors to
 * /login, which explains that login is not configured.
 */
export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
