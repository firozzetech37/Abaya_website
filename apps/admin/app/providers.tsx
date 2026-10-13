'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast, Toaster } from 'sonner';
import { strings } from '@/content/strings';
import { ApiError, errorMessage, onApiError } from '@/lib/api-client';
import { AuthProvider, SECURITY_PATH, useAuth } from '@/lib/auth';

const RELOAD_CODES = new Set(['STALE_STAGE', 'INVALID_TRANSITION']);

function makeQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return count < 2;
        },
      },
    },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.silent) return;
        if (error instanceof ApiError && error.code === 'MFA_REQUIRED') return; // handled by redirect
        if (error instanceof ApiError && RELOAD_CODES.has(error.code)) {
          toast.warning(strings.errors[error.code] ?? error.message);
          void client.invalidateQueries();
          return;
        }
        toast.error(errorMessage(error));
      },
    }),
  });
  return client;
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}

/** App-wide reactions to auth errors from the API: MFA required and expired sessions. */
function ApiErrorRouter() {
  const router = useRouter();
  const { signOut } = useAuth();
  React.useEffect(
    () =>
      onApiError((error) => {
        if (typeof window === 'undefined') return;
        const path = window.location.pathname;
        if (path.startsWith('/login')) return;
        if (error.code === 'MFA_REQUIRED') {
          if (path.startsWith('/account')) return;
          toast.info(strings.auth.mfaRequiredNotice);
          router.replace(`${SECURITY_PATH}?reason=mfa`);
        } else if (error.status === 401) {
          // The API rejected this Clerk session; end it so /login starts fresh.
          toast.info(strings.auth.sessionExpired);
          void signOut();
        }
      }),
    [router, signOut],
  );
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiErrorRouter />
        {children}
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ duration: 4000 }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
