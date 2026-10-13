'use client';

import { stationsForRoles } from '@abaya/contracts';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { strings } from '@/content/strings';
import { CurrentUserProvider } from '@/lib/current-user';
import { useStaffAccess } from '@/lib/staff-access';

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background px-4">{children}</div>;
}

/**
 * /workshop: same sign-in and the same sidebar shell as the admin panel; only people with a
 * station get in. The sidebar shows each person only their own stations (and office pages
 * for office staff).
 */
export default function WorkshopLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { me, home, pending, signOut } = useStaffAccess();
  const stations = me.data ? stationsForRoles(me.data.roles) : [];
  // Office staff without a station (catalog, support…) belong in the admin panel.
  const officeOnly = home !== null && stations.length === 0;

  React.useEffect(() => {
    if (officeOnly) router.replace('/');
  }, [officeOnly, router]);

  if (pending || officeOnly) {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-accent-700" aria-label={strings.common.loading} />
      </Centered>
    );
  }
  if (me.isError) {
    return (
      <Centered>
        <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-sm">
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        </div>
      </Centered>
    );
  }
  if (!me.data || home === null) {
    return (
      <Centered>
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
      </Centered>
    );
  }

  return (
    <CurrentUserProvider value={me.data}>
      <AppShell me={me.data}>{children}</AppShell>
    </CurrentUserProvider>
  );
}
