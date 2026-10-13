'use client';

import type { MeResponse, Role } from '@abaya/contracts';
import * as React from 'react';
import { type Capability, can } from './permissions';

const CurrentUserContext = React.createContext<MeResponse | null>(null);

export const CurrentUserProvider = CurrentUserContext.Provider;

/** The signed-in staff member (only available inside the console layout). */
export function useCurrentUser(): MeResponse & { can: (c: Capability) => boolean; hasRole: (r: Role) => boolean } {
  const me = React.useContext(CurrentUserContext);
  if (!me) throw new Error('useCurrentUser must be used inside the console layout');
  return {
    ...me,
    can: (c: Capability) => can(me.roles, c),
    hasRole: (r: Role) => me.roles.includes(r),
  };
}
