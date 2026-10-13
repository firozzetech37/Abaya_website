'use client';

import { staffHomePath } from '@abaya/contracts';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { useAuth } from './auth';
import { useMe } from './queries/me';

/**
 * One login page for every staff member; this decides where they belong. Office staff
 * → the admin panel; workshop staff (tailors too) → their station(s). Roles come from the
 * API (/v1/me), which already granted any staff invite for this verified email at sign-in.
 */
export function useStaffAccess() {
  const { state, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = state.status === 'signed-in';
  const me = useMe(signedIn);
  const home = me.data ? staffHomePath(me.data.roles) : null;

  React.useEffect(() => {
    if (state.status === 'signed-out' || state.status === 'unconfigured') {
      // Clerk's <SignIn/> returns to `redirect_url` after sign-in.
      const next = pathname && pathname !== '/' ? `?redirect_url=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [state.status, router, pathname]);

  return {
    signOut,
    me,
    /** Where this person belongs (null: not staff). */
    home,
    /** Still working out who they are. */
    pending: !signedIn || me.isPending,
  };
}
