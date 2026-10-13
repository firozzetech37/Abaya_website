import { ClerkProvider, useAuth as useClerkAuth, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { setTokenGetter } from './auth-token';
import { env, isClerkConfigured } from './env';
import { unregisterPush } from './push';

/** The signed-in person as the app needs it (Clerk user id + primary email / phone). */
export interface AuthSession {
  user: { id: string; email: string | null; phone: string | null };
}

interface AuthState {
  session: AuthSession | null;
  /** False until Clerk has loaded the stored session from SecureStore. */
  ready: boolean;
  signOut: () => Promise<void>;
}

const signedOut: AuthState = { session: null, ready: true, signOut: async () => {} };
const AuthContext = createContext<AuthState>({ ...signedOut, ready: false });

const isMeQuery = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === 'me';

/** Reads Clerk's state inside <ClerkProvider> and exposes it through our own context. */
function ClerkBridge({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn, userId, getToken, signOut: clerkSignOut } = useClerkAuth();
  const { user } = useUser();

  // Layout effect: registered before any child's passive effect (React Query fetches) runs.
  useLayoutEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);

  // Anything cached for the previous user must not leak to the next one.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (!isLoaded) return;
    if (wasSignedIn.current && !isSignedIn) queryClient.removeQueries({ predicate: isMeQuery });
    wasSignedIn.current = Boolean(isSignedIn);
  }, [isLoaded, isSignedIn, queryClient]);

  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const phone = user?.primaryPhoneNumber?.phoneNumber ?? null;
  const session = useMemo<AuthSession | null>(
    () => (isSignedIn && userId ? { user: { id: userId, email, phone } } : null),
    [isSignedIn, userId, email, phone],
  );

  const value = useMemo<AuthState>(
    () => ({
      session,
      ready: isLoaded,
      signOut: async () => {
        // Remove this phone's push token while the session token is still valid.
        await unregisterPush();
        // After account deletion the Clerk session is already revoked; signing out locally still works.
        await clerkSignOut().catch(() => undefined);
        queryClient.removeQueries({ predicate: isMeQuery });
      },
    }),
    [session, isLoaded, clerkSignOut, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Clerk is mounted only when a publishable key is configured; without one the app
 * runs logged out and the login screen shows "not configured".
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isClerkConfigured) return <AuthContext.Provider value={signedOut}>{children}</AuthContext.Provider>;
  return (
    <ClerkProvider
      publishableKey={env.clerkPublishableKey}
      // SecureStore only exists on phones; in a browser Clerk keeps the session itself.
      tokenCache={Platform.OS === 'web' ? undefined : tokenCache}
    >
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}

export const useAuth = () => useContext(AuthContext);
