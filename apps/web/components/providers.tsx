'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Toaster } from 'sonner';
import { isApiError } from '@/lib/api-client';
import { AuthProvider } from '@/lib/auth';
import { ConsentGate } from './account/consent-gate';
import { AiReadyNotifier } from './design/ai-ready-notifier';
import { useStrings } from './i18n/locale-provider';
import { MotionProvider } from './motion/motion-provider';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
            // Do not retry client errors (401/403/404/422); do retry flaky network once.
            retry: (count, error) => (isApiError(error) && error.status >= 400 && error.status < 500 ? false : count < 1),
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MotionProvider>
          {children}
          <ConsentGate />
          <AiReadyNotifier />
          <LocalisedToaster />
        </MotionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Toasts with labels in the page's language (screen readers). */
function LocalisedToaster() {
  const { nav } = useStrings();
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      containerAriaLabel={nav.notifications}
      toastOptions={{ className: 'font-sans', closeButtonAriaLabel: nav.closeNotification }}
    />
  );
}
