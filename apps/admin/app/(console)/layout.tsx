'use client';

import { Loader2, ShieldAlert } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { AppShell } from '@/components/app-shell';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { strings } from '@/content/strings';
import { CurrentUserProvider } from '@/lib/current-user';
import { useStaffAccess } from '@/lib/staff-access';

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background px-4">{children}</div>;
}

function Spinner() {
  return (
    <FullScreen>
      <Loader2 className="size-6 animate-spin text-accent-700" aria-label={strings.common.loading} />
    </FullScreen>
  );
}

/**
 * Layout guard: signed in (Clerk) → GET /v1/me → office staff only. Workshop staff are
 * sent to their station (one login page for everyone, lib/staff-access.ts). Two-factor
 * challenges happen inside Clerk's <SignIn/>; a 403 MFA_REQUIRED from the API sends staff
 * to /account/security (providers.tsx), which every staff member may open.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, home, pending, signOut } = useStaffAccess();
  const workshopOnly = home?.startsWith('/workshop') ?? false;
  const accountPage = pathname?.startsWith('/account') ?? false;
  // Designers work in the Studio; the office dashboard is not theirs.
  const studioHome = home === '/studio' && pathname === '/';

  React.useEffect(() => {
    if ((workshopOnly && !accountPage) || studioHome) router.replace(home!);
  }, [workshopOnly, accountPage, studioHome, home, router]);

  if (pending) return <Spinner />;

  if (me.isError) {
    return (
      <FullScreen>
        <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-sm">
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
          <div className="border-t border-border p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              {strings.common.signOut}
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (!me.data || home === null) {
    return (
      <FullScreen>
        <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <ShieldAlert className="size-6" aria-hidden />
          </div>
          <h1 className="font-display text-2xl font-semibold">{strings.workshop.notRegisteredTitle}</h1>
          <p className="mt-2 text-sm text-muted">{strings.workshop.notRegisteredBody(me.data?.email ?? null)}</p>
          <Button className="mt-6" variant="secondary" onClick={() => void signOut()}>
            {strings.common.signOut}
          </Button>
        </div>
      </FullScreen>
    );
  }

  if ((workshopOnly && !accountPage) || studioHome) return <Spinner />;

  // Printable views render without the console chrome.
  const bare = pathname?.endsWith('/print');
  return (
    <CurrentUserProvider value={me.data}>
      {bare ? children : <AppShell me={me.data}>{children}</AppShell>}
    </CurrentUserProvider>
  );
}
