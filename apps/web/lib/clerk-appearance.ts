import type { ClerkProvider } from '@clerk/nextjs';
import { tokens } from '@abaya/ui';
import type { ComponentProps } from 'react';

type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>['appearance']>;

const c = tokens.colors;
const sans = 'var(--font-sans), Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const display = 'var(--font-display), "Playfair Display", Georgia, serif';
// Antique gold (tailwind.config.cjs `gold`): the same brushed-gold as the website's primary buttons.
const GOLD = 'linear-gradient(120deg, #F5EACB 0%, #D9B86A 28%, #B48734 52%, #E6CD8E 78%, #CCA24A 100%)';
const GOLD_HAIRLINE = 'linear-gradient(90deg, #F5EACB 0%, #B48734 50%, #E6CD8E 100%)';

/**
 * Clerk's prebuilt UI dressed in our tokens: champagne surfaces with a gold hairline, emerald
 * links, Playfair headings, pill buttons (brushed gold for the primary one), 16 px inputs (no iOS
 * zoom) and 44 px+ touch targets.
 * Styles are CSS objects (not Tailwind classes) so they reliably win over Clerk's own styles.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: c.primary,
    colorPrimaryForeground: c['primary-foreground'],
    colorForeground: c.foreground,
    colorMutedForeground: c.neutral[600],
    colorMuted: c.neutral[100],
    colorBackground: c.surface,
    colorInput: c.surface,
    colorInputForeground: c.foreground,
    colorBorder: c.neutral[300],
    colorNeutral: c.neutral[900],
    colorDanger: c.danger,
    colorSuccess: c.success,
    colorWarning: c.warning,
    colorRing: c.accent[500],
    colorShimmer: c.neutral[50],
    fontFamily: sans,
    fontFamilyButtons: sans,
    fontSize: '0.9375rem',
    borderRadius: '0.75rem',
  },
  options: {
    logoPlacement: 'none',
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
    termsPageUrl: '/policies/terms',
    privacyPageUrl: '/policies/privacy',
    helpPageUrl: '/help',
    animations: true,
  },
  elements: {
    rootBox: { width: '100%' },
    cardBox: {
      position: 'relative',
      width: '100%',
      maxWidth: '100%',
      borderRadius: '1.25rem',
      border: `1px solid ${c.border}`,
      boxShadow: '0 30px 60px -40px rgba(107, 31, 42, 0.35), 0 1px 2px rgba(35, 28, 23, 0.05)',
      // The gold hairline along the top edge
      '&::before': {
        content: '""',
        position: 'absolute',
        insetInline: 0,
        top: 0,
        height: '3px',
        zIndex: 1,
        background: GOLD_HAIRLINE,
      },
    },
    card: { padding: '1.75rem 1.25rem', boxShadow: 'none', gap: '1.5rem' },
    headerTitle: {
      fontFamily: display,
      fontSize: '1.75rem',
      lineHeight: 1.15,
      fontWeight: 400,
      letterSpacing: '-0.01em',
      color: c.foreground,
    },
    headerSubtitle: { fontSize: '0.875rem', color: c.neutral[600] },
    socialButtonsBlockButton: {
      minHeight: '2.875rem',
      borderRadius: '9999px',
      borderColor: c.neutral[300],
      backgroundColor: c.surface,
    },
    socialButtonsBlockButtonText: { fontWeight: 500, fontSize: '0.9375rem' },
    dividerText: { textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '0.6875rem', color: c.muted },
    dividerLine: { backgroundColor: c.border },
    formFieldLabel: { fontWeight: 500, color: c.neutral[800] },
    formFieldInput: { minHeight: '2.875rem', fontSize: '1rem' },
    otpCodeFieldInput: { minHeight: '3rem', fontSize: '1.25rem' },
    formButtonPrimary: {
      minHeight: '2.875rem',
      borderRadius: '9999px',
      fontSize: '0.9375rem',
      fontWeight: 600,
      textTransform: 'none',
      border: 'none',
      color: c.neutral[900],
      backgroundImage: GOLD,
      backgroundColor: '#CCA24A',
      boxShadow: '0 14px 30px -16px rgba(180, 135, 52, 0.7)',
      transition: 'transform 0.2s ease, filter 0.2s ease',
      '&:hover, &:focus-visible': { backgroundImage: GOLD, backgroundColor: '#CCA24A', color: c.neutral[900], filter: 'brightness(1.04)', transform: 'translateY(-1px)' },
      '&:active': { transform: 'none' },
      '& *': { color: c.neutral[900] },
    },
    footer: { background: c.neutral[50] },
    footerActionLink: { color: c.accent[700], fontWeight: 600 },
    formResendCodeLink: { color: c.accent[700] },
    identityPreviewEditButton: { color: c.accent[700] },
  },
};
