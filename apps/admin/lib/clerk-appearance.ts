import type { SignIn } from '@clerk/nextjs';
import type * as React from 'react';

type Appearance = NonNullable<React.ComponentProps<typeof SignIn>['appearance']>;

/**
 * Clerk's prebuilt components styled with our tokens (packages/config/tailwind/tokens.json):
 * warm neutrals, the single deep-burgundy accent, Inter body and Cormorant Garamond headings.
 * Applied globally through <ClerkProvider appearance>.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: '#6B1F2A', // accent-700
    colorPrimaryForeground: '#FFFFFF',
    colorDanger: '#C2410C',
    colorBackground: '#FFFFFF', // surface
    colorForeground: '#1C1A18', // neutral-900
    colorMutedForeground: '#7D766C', // muted
    colorMuted: '#F3F1ED', // neutral-100
    colorNeutral: '#1C1A18',
    colorInput: '#FFFFFF',
    colorInputForeground: '#1C1A18',
    colorBorder: '#E6E2DB', // border
    colorRing: '#479D90', // accent-400
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    borderRadius: '8px',
  },
  elements: {
    logoBox: 'hidden', // our own header carries the brand
    card: 'shadow-sm border border-border',
    headerTitle: 'font-display text-2xl font-semibold text-foreground',
    headerSubtitle: 'text-sm text-muted',
    formButtonPrimary: 'normal-case',
    footerAction: 'hidden', // no sign-up link: new staff sign in the same way
  },
};
