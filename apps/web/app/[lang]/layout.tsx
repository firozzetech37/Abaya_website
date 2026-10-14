import { ClerkProvider } from '@clerk/nextjs';
import { clerkArabic } from '@/content/clerk-ar';
import type { Metadata, Viewport } from 'next';
import { Amiri, IBM_Plex_Sans_Arabic, Inter, Playfair_Display } from 'next/font/google';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@/components/i18n/locale-provider';
import { ArchLoader } from '@/components/layout/arch-loader';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { RevealObserver } from '@/components/motion/reveal-observer';
import { Providers } from '@/components/providers';
import { Pwa } from '@/components/pwa/pwa';
import { alternatesFor, dictionaryFor, dirFor, htmlLang, isLocale, type Locale, LOCALES, localizePath } from '@/content/i18n';
import { clerkAppearance } from '@/lib/clerk-appearance';
import { CLERK_PUBLISHABLE_KEY, isClerkConfigured, LOGIN_PATH, SITE_URL } from '@/lib/env';
import '../globals.css';

// English: Inter + Playfair Display (a high-contrast editorial serif). Arabic: IBM Plex Sans Arabic + Amiri (both include Latin
// glyphs for the brand name and numbers). Only the page's own pair is used, so only it loads.
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], variable: '--font-display', display: 'swap' });
const arabicSans = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});
const arabicDisplay = Amiri({ subsets: ['arabic', 'latin'], weight: ['400', '700'], variable: '--font-display', display: 'swap' });

type Props = { children: ReactNode; params: Promise<{ lang: string }> };

/** Both languages are pre-rendered: / (English) and /ar (Arabic). */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : 'en';
  const { brand } = dictionaryFor(locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
    description: brand.description,
    applicationName: brand.name,
    alternates: alternatesFor(locale, '/'),
    openGraph: { type: 'website', siteName: brand.name, locale: locale === 'ar' ? 'ar_AR' : 'en_IN' },
    twitter: { card: 'summary_large_image' },
    // Installable as an app (app/manifest.ts), with the gold arch icon.
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    },
    appleWebApp: { capable: true, title: brand.name, statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = {
  themeColor: '#F8F2E7',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children, params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const { nav } = dictionaryFor(locale);
  const fonts = locale === 'ar' ? `${arabicSans.variable} ${arabicDisplay.variable}` : `${sans.variable} ${display.variable}`;

  const page = (
    // suppressHydrationWarning: the inline script adds the `js` class before React hydrates.
    <html lang={htmlLang(locale)} dir={dirFor(locale)} className={fonts} suppressHydrationWarning>
      <head>
        {/* `js`: the entrance loader may show (components/layout/arch-loader.tsx) */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <LocaleProvider locale={locale}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
          >
            {nav.skipToContent}
          </a>
          <ArchLoader />
          <Providers>
            <Header />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer locale={locale} />
            <RevealObserver />
            <Pwa />
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );

  // No Clerk key (local dev, CI builds): do not mount Clerk at all. Public pages work; login shows
  // "not configured". Not `dynamic`, so the public catalogue stays statically rendered / ISR-cached.
  if (!isClerkConfigured()) return page;
  const loginPath = localizePath(locale, LOGIN_PATH);
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={clerkAppearance}
      localization={locale === 'ar' ? clerkArabic : undefined}
      signInUrl={loginPath}
      signUpUrl={loginPath}
      afterSignOutUrl={localizePath(locale, '/')}
    >
      {page}
    </ClerkProvider>
  );
}
