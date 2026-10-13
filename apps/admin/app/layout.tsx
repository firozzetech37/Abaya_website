import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import type * as React from 'react';
import { strings } from '@/content/strings';
import { clerkAppearance } from '@/lib/clerk-appearance';
import { env, isClerkConfigured } from '@/lib/env';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: strings.appName, template: `%s · ${strings.appName}` },
  description: strings.appTagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#6B1F2A', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout applies to every page */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        {isClerkConfigured() ? (
          <ClerkProvider
            publishableKey={env.clerkPublishableKey}
            appearance={clerkAppearance}
            signInUrl="/login"
            signInFallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/"
            afterSignOutUrl="/login"
          >
            <Providers>{children}</Providers>
          </ClerkProvider>
        ) : (
          // No publishable key: skip Clerk entirely; /login shows "Login is not configured".
          <Providers>{children}</Providers>
        )}
      </body>
    </html>
  );
}
