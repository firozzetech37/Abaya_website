'use client';

import { UserProfile } from '@clerk/nextjs';
import { ShieldAlert } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { strings } from '@/content/strings';
import { useAuth } from '@/lib/auth';

/** Shown when an API call answered 403 MFA_REQUIRED (we arrive with ?reason=mfa). */
function MfaRequiredNotice() {
  const params = useSearchParams();
  const { signOut } = useAuth();
  if (params.get('reason') !== 'mfa') return null;
  return (
    <div role="alert" className="mb-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{strings.account.mfaRequiredTitle}</p>
        <p className="mt-1 text-sm">{strings.account.mfaRequiredBody}</p>
        <Button className="mt-3" size="sm" variant="secondary" onClick={() => void signOut()}>
          {strings.account.signInAgain}
        </Button>
      </div>
    </div>
  );
}

/**
 * Clerk's <UserProfile/> with path routing under /account; /account/security is
 * its security section, where staff add an authenticator app (TOTP) and backup codes.
 */
export default function AccountPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader title={strings.account.title} subtitle={strings.account.subtitle} />
      <React.Suspense fallback={null}>
        <MfaRequiredNotice />
      </React.Suspense>
      <UserProfile
        path="/account"
        routing="path"
        appearance={{ elements: { rootBox: 'w-full', cardBox: 'w-full max-w-none shadow-sm border border-border' } }}
      />
    </div>
  );
}
