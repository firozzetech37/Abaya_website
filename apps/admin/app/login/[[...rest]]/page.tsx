import { ClerkLoading, SignIn } from '@clerk/nextjs';
import { KeyRound, Loader2 } from 'lucide-react';
import type { Metadata } from 'next';
import { strings } from '@/content/strings';
import { isClerkConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Sign in' };

function BrandHeader() {
  return (
    <div className="mb-8 text-center">
      <p className="font-display text-4xl font-semibold text-accent-800">{strings.auth.brand}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted">{strings.auth.consoleLabel}</p>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-accent-50 text-accent-700">
        <KeyRound className="size-5" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-semibold">{strings.auth.notConfiguredTitle}</h1>
      <p className="mt-2 text-sm text-muted">{strings.auth.notConfiguredBody}</p>
    </div>
  );
}

/**
 * Staff sign-in: Clerk's prebuilt <SignIn/> with path routing, so its sub-steps
 * (email code, second factor, first-time account creation) live under /login/*.
 * `withSignUp` = Clerk's combined sign-in-or-up flow: a new staff email is
 * created on first sign-in; access still depends on the roles in OUR database.
 * After sign-in the console layout calls GET /v1/me and checks staff roles.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 py-12">
      <BrandHeader />
      {isClerkConfigured() ? (
        <>
          <ClerkLoading>
            <Loader2 className="size-6 animate-spin text-accent-700" aria-label={strings.common.loading} />
          </ClerkLoading>
          <SignIn
            path="/login"
            routing="path"
            withSignUp
            fallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/"
          />
          <p className="mt-6 max-w-sm text-center text-xs text-muted">{strings.auth.staffOnly}</p>
        </>
      ) : (
        <NotConfigured />
      )}
    </main>
  );
}
