'use client';

import { useAuth as useClerkAuth } from '@clerk/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { setTokenGetter } from './api-client';
import { isClerkConfigured } from './env';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string };

interface AuthContextValue {
  state: AuthState;
  /** Clears cached API data, ends the Clerk session and lands on /login. */
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

const SIGNED_OUT_URL = '/login';

/** Where staff turn on two-factor: Clerk's <UserProfile/> security section. */
export const SECURITY_PATH = '/account/security';

/** Bridges Clerk's session into our app-wide auth context and the API client. */
function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn, userId, getToken, signOut: clerkSignOut } = useClerkAuth();

  const getTokenRef = React.useRef(getToken);
  // Layout effect: runs before any child's passive effects, so the first API
  // query (fired from a child effect) already has the token getter.
  React.useLayoutEffect(() => {
    getTokenRef.current = getToken;
    setTokenGetter(() => getTokenRef.current());
    return () => setTokenGetter(null);
  }, [getToken]);

  const state: AuthState = React.useMemo(() => {
    if (!isLoaded) return { status: 'loading' };
    return isSignedIn && userId ? { status: 'signed-in', userId } : { status: 'signed-out' };
  }, [isLoaded, isSignedIn, userId]);

  const signOut = React.useCallback(async () => {
    await clerkSignOut({ redirectUrl: SIGNED_OUT_URL });
    queryClient.clear();
  }, [clerkSignOut, queryClient]);

  const value = React.useMemo(() => ({ state, signOut }), [state, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const UNCONFIGURED: AuthContextValue = { state: { status: 'unconfigured' }, signOut: async () => undefined };

/**
 * Clerk is mounted (in the root layout) only when its publishable key is set;
 * otherwise every screen sees the "unconfigured" state instead of crashing.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!isClerkConfigured()) return <AuthContext.Provider value={UNCONFIGURED}>{children}</AuthContext.Provider>;
  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
