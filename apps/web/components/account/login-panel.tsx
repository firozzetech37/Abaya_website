'use client';

import { SignIn } from '@clerk/nextjs';
import { Camera, LogIn, Ruler, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { DesignImage } from '@/components/design/design-image';
import { useStrings } from '@/components/i18n/locale-provider';
import { Link, useLocalizePath, usePathname, useRouter, useSearchParams } from '@/components/i18n/navigation';
import { BrandMark } from '@/components/layout/brand-mark';
import { MaskedText } from '@/components/motion/masked-text';
import { Button } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/misc';
import { useAuth } from '@/lib/auth';
import { isClerkConfigured, LOGIN_PATH } from '@/lib/env';
import { safeNext } from '@/lib/utils';

/** The abaya the customer was looking at when login was asked for (Add to bag, try-on…). */
export interface KeepDesign {
  name: string;
  slug: string;
  imageUrl: string | null;
}

const TRUST_ICONS = [Ruler, Camera, ShieldCheck];

/**
 * Clerk's prebuilt sign-in with sign-up folded in (one flow for new and returning customers):
 * email + one-time code, or Google. Styled through `clerkAppearance` on the ClerkProvider; on the
 * first step Clerk's own title ("Continue to <app>") is hidden in favour of ours, while later steps
 * keep theirs ("Check your email").
 * `?redirect_url=` (set by the middleware, "Add to bag", the bag, etc.) brings the customer back.
 */
export function LoginPanel({ keep }: { keep: KeepDesign | null }) {
  const { auth: t, brand, nav } = useStrings();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useAuth();
  const localize = useLocalizePath();
  const raw = params.get('redirect_url') ?? params.get('next');
  const redirectTo = useMemo(
    () => safeNext(raw, '/account', typeof window === 'undefined' ? undefined : window.location.origin),
    [raw],
  );
  const atStart = pathname === LOGIN_PATH;

  // Already signed in (back button, second tab): go straight on. Only on the first step, so Clerk
  // can finish its own sub-steps (e.g. /login/sso-callback) and redirect itself.
  useEffect(() => {
    if (status === 'authenticated' && atStart) router.replace(redirectTo);
  }, [status, atStart, redirectTo, router]);

  return (
    <div className="motion-safe:animate-fade-up">
      <header className="mb-7">
        <p className="flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.24em] text-rose-600">
          <BrandMark draw className="h-6 text-accent-700" />
          {brand.name}
        </p>
        <h1 className="mt-4 font-display text-[2.4rem] leading-[1.02] tracking-[-0.01em] text-foreground sm:text-[2.9rem]">
          <MaskedText text={keep ? t.keepTitle : t.title} mode="load" delay={120} />
        </h1>
        {keep ? (
          <Link
            href={`/abayas/${keep.slug}`}
            className="group mt-4 flex items-center gap-3 rounded-2xl border border-gold-200/80 bg-surface/80 p-2 pe-4 shadow-sm backdrop-blur transition-colors hover:border-gold-400"
          >
            <DesignImage src={keep.imageUrl} alt="" name={keep.name} sizes="56px" imagePosition="50% 15%" className="size-14 shrink-0 rounded-xl rounded-t-full" />
            <span className="min-w-0">
              <span className="block truncate font-display text-lg leading-tight text-foreground">{keep.name}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t.keepBody}</span>
            </span>
          </Link>
        ) : (
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-neutral-600">{t.benefits}</p>
        )}
      </header>

      {isClerkConfigured() ? (
        <SignIn
          routing="path"
          path={localize(LOGIN_PATH)}
          signUpUrl={localize(LOGIN_PATH)}
          withSignUp
          forceRedirectUrl={localize(redirectTo)}
          signUpForceRedirectUrl={localize(redirectTo)}
          appearance={atStart ? { elements: { header: { display: 'none' } } } : undefined}
          fallback={<LoginSkeleton />}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <Alert tone="warning">{t.notConfigured}</Alert>
          <Button asChild variant="secondary" size="lg" className="mt-6 w-full">
            <Link href="/abayas">
              <LogIn aria-hidden />
              {nav.shop}
            </Link>
          </Button>
        </div>
      )}

      {/* What an account gives: three quiet promises under the card */}
      <ul className="mt-7 grid gap-4 sm:grid-cols-3 sm:gap-3">
        {t.trust.map((item, i) => {
          const Icon = TRUST_ICONS[i] ?? ShieldCheck;
          return (
            <li key={item.title} className="flex items-start gap-3 sm:flex-col sm:gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gold-300/70 bg-surface text-accent-700">
                <Icon className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">{item.title}</span>
                <span className="block text-xs leading-relaxed text-muted">{item.body}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        <Link href="/policies/terms" className="underline underline-offset-2">
          {t.legal}
        </Link>
      </p>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-6" aria-busy="true">
      <Skeleton className="h-11 rounded-full" />
      <Skeleton className="h-3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-11" />
      <Skeleton className="h-11 rounded-full" />
    </div>
  );
}
