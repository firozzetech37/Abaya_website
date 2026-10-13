'use client';

import { getToken, useAuth as useClerkAuth, useClerk } from '@clerk/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { setTokenProvider } from './api-client';
import { isClerkConfigured } from './env';

/**
 * App-wide auth state, backed by Clerk. Components use this hook instead of Clerk's directly so the
 * site keeps working (as "unconfigured") when no Clerk keys are set and ClerkProvider is not mounted.
 */
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'unconfigured';

interface AuthContextValue {
  status: AuthStatus;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: 'unconfigured',
  signOut: async () => undefined,
});

// Register the token provider at module load so the very first API call already carries the token.
// Clerk's global getToken() waits for Clerk to load and returns the default session token (or null).
setTokenProvider(async () => {
  if (!isClerkConfigured() || typeof window === 'undefined') return null;
  try {
    return await getToken();
  } catch {
    // Clerk failed to load or the browser is offline: the call goes out anonymously and the API answers 401.
    return null;
  }
});

/** Everything user-specific is cached under ['me', ...] (see queries/keys.ts). */
const isUserQuery = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === 'me';

function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn, userId } = useClerkAuth();
  const clerk = useClerk();
  const status: AuthStatus = !isLoaded ? 'loading' : isSignedIn ? 'authenticated' : 'anonymous';

  // Drop cached user data whenever the signed-in user changes (sign-out, other tab, account switch).
  const lastUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    const current = userId ?? null;
    if (lastUser.current !== undefined && lastUser.current !== current) queryClient.removeQueries({ predicate: isUserQuery });
    lastUser.current = current;
  }, [isLoaded, userId, queryClient]);

  const signOut = useCallback(async () => {
    try {
      await clerk.signOut();
    } catch {
      // The session may already be gone (e.g. the API deleted the Clerk user); local state is cleared below.
    }
    queryClient.removeQueries({ predicate: isUserQuery });
  }, [clerk, queryClient]);

  const value = useMemo(() => ({ status, signOut }), [status, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Build-time constant: ClerkProvider is only mounted (in app/layout.tsx) when a key is configured.
  if (!isClerkConfigured()) return <AuthContext.Provider value={UNCONFIGURED}>{children}</AuthContext.Provider>;
  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
}

const UNCONFIGURED: AuthContextValue = { status: 'unconfigured', signOut: async () => undefined };

export const useAuth = (): AuthContextValue => useContext(AuthContext);
