'use client';

import { Link, usePathname, useRouter } from '@/components/i18n/navigation';
import { LogIn } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { useAuth } from '@/lib/auth';
import { loginHref } from '@/lib/utils';

/** Client-side guard for account pages. The API enforces auth anyway; this is for UX. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { auth, common, nav } = useStrings();
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace(loginHref(pathname));
  }, [status, router, pathname]);

  if (status === 'authenticated') return <>{children}</>;
  if (status === 'unconfigured')
    return (
      <div className="container py-16">
        <EmptyState
          icon={<LogIn className="size-5" aria-hidden />}
          title={common.loginRequired}
          body={auth.notConfigured}
          action={
            <Button asChild variant="secondary">
              <Link href="/abayas">{nav.shop}</Link>
            </Button>
          }
        />
      </div>
    );
  return (
    <div className="container space-y-4 py-12" aria-busy="true" aria-label={common.loading}>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  );
}
