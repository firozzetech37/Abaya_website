import { clerkMiddleware } from '@clerk/nextjs/server';
import { type NextMiddleware, type NextRequest, NextResponse } from 'next/server';
import { localeOfPath, localizePath, stripLocale } from './content/i18n';
import { isClerkServerConfigured, LOGIN_PATH } from './lib/env';
import { ARABIC_COUNTRIES, COUNTRY_COOKIE, GEO_RESET_COOKIE, isCountryCode, LANG_AUTO_COOKIE } from './lib/geo';

/**
 * Languages: English at the plain URLs (/abayas → app/[lang=en]), Arabic under /ar
 * (/ar/abayas → app/[lang=ar]). /en/... is redirected to the plain URL so every page has
 * one English address. A first visit from the Gulf opens the Arabic site (lib/geo.ts).
 *
 * Only personal pages need a session; everything else (home, catalogue, collections, design
 * pages, help, policies, bag, sitemap, robots, OG images) stays public. The API enforces auth
 * anyway; this just sends logged-out visitors to the login page (in their language) and back.
 */
const PROTECTED = /^\/(account|checkout|orders|downloads)(\/|$)/;

const YEAR = 60 * 60 * 24 * 365;
/** Search engines and link previews always get the page they asked for (both languages stay indexed). */
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|embedly|preview|lighthouse/i;

/**
 * The visitor's country: `?country=XX` (for testing; also forgets the saved currency once), then
 * the host's geo header (Vercel, Cloudflare), then the country remembered from an earlier visit.
 */
function countryOf(request: NextRequest): { country: string | null; override: boolean } {
  const asked = request.nextUrl.searchParams.get('country');
  if (isCountryCode(asked)) return { country: asked.toUpperCase(), override: true };
  const header = request.headers.get('x-vercel-ip-country') ?? request.headers.get('cf-ipcountry');
  if (isCountryCode(header)) return { country: header.toUpperCase(), override: false };
  const saved = request.cookies.get(COUNTRY_COOKIE)?.value;
  return { country: isCountryCode(saved) ? saved.toUpperCase() : null, override: false };
}

/** A real page visit by a person (not a prefetch, an RSC request or a bot). */
const isPageVisit = (request: NextRequest) =>
  request.method === 'GET' &&
  (request.headers.get('accept') ?? '').includes('text/html') &&
  !request.headers.has('rsc') &&
  !request.headers.has('next-router-prefetch') &&
  !BOT.test(request.headers.get('user-agent') ?? '');

function remember(response: NextResponse, request: NextRequest, country: string | null, override: boolean): NextResponse {
  const opts = { path: '/', maxAge: YEAR, sameSite: 'lax' as const };
  if (country && request.cookies.get(COUNTRY_COOKIE)?.value !== country) response.cookies.set(COUNTRY_COOKIE, country, opts);
  if (!request.cookies.has(LANG_AUTO_COOKIE) || override) response.cookies.set(LANG_AUTO_COOKIE, '1', opts);
  if (override) response.cookies.set(GEO_RESET_COOKIE, '1', { path: '/', maxAge: 300, sameSite: 'lax' });
  return response;
}

function routeLocale(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (/^\/en(\/|$)/.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = stripLocale(pathname);
    return NextResponse.redirect(url, 308);
  }
  const locale = localeOfPath(pathname);
  const page = isPageVisit(request);
  const { country, override } = page ? countryOf(request) : { country: null, override: false };

  // First visit (or a ?country= test): Gulf visitors open the Arabic site, everyone else English.
  // Afterwards the language is whatever page they open, so their own switch always wins.
  if (page && country && (override || !request.cookies.has(LANG_AUTO_COOKIE))) {
    const wantArabic = ARABIC_COUNTRIES.includes(country);
    // A shared Arabic link opens in Arabic for anyone; only the ?country= test sends Arabic pages back to English.
    if (wantArabic !== (locale === 'ar') && (wantArabic || override)) {
      const url = request.nextUrl.clone();
      url.pathname = wantArabic ? localizePath('ar', stripLocale(pathname)) : stripLocale(pathname);
      url.searchParams.delete('country');
      return remember(NextResponse.redirect(url, 307), request, country, override);
    }
  }

  let response: NextResponse;
  if (locale === 'ar') response = NextResponse.next();
  else {
    const url = request.nextUrl.clone();
    url.pathname = `/en${pathname === '/' ? '' : pathname}`;
    response = NextResponse.rewrite(url);
  }
  return page ? remember(response, request, country, override) : response;
}

/** Personal pages, in either language (/orders, /ar/orders). */
const protectedPage = (request: NextRequest) => PROTECTED.test(stripLocale(request.nextUrl.pathname));

const withClerk = clerkMiddleware(
  async (auth, request) => {
    if (protectedPage(request)) {
      const { userId } = await auth();
      if (!userId) {
        const locale = localeOfPath(request.nextUrl.pathname);
        const url = new URL(localizePath(locale, LOGIN_PATH), request.url);
        url.searchParams.set('redirect_url', `${stripLocale(request.nextUrl.pathname)}${request.nextUrl.search}`);
        return NextResponse.redirect(url);
      }
    }
    return routeLocale(request);
  },
  { signInUrl: LOGIN_PATH, signUpUrl: LOGIN_PATH },
);

/** Without Clerk keys (local dev, CI builds) nothing is protected here; pages show "Login is not configured". */
const localeOnly: NextMiddleware = (request) => routeLocale(request);

export const middleware: NextMiddleware = (request, event) =>
  isClerkServerConfigured() ? withClerk(request, event) : localeOnly(request, event);

export const config = {
  matcher: [
    // Skip Next internals, the version check (/api/version) and static files (sitemap, robots, OG
    // images, icons, fonts, the app manifest, the service worker and its offline page).
    '/((?!_next|api/|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|txt|xml|map|mp4|webm|html|webmanifest)$).*)',
  ],
};
