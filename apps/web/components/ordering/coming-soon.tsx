'use client';

import { BellRing, Check, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Link, usePathname } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { EightPointStar } from '@/components/ornament/geometric';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { useJoinOrderingWaitlist, useOrderingOpen, useOrderingWaitlist } from '@/lib/queries/ordering';
import { cn, loginHref } from '@/lib/utils';

/** Shows `children` only once ordering is known to be open; `fallback` while it is closed. */
export function WhenOrderingOpen({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const open = useOrderingOpen();
  if (open === null) return null;
  return <>{open ? children : fallback}</>;
}

/** "Notify me when ordering opens": signed in, one tap; signed out, log in first and come back. */
export function NotifyMeButton({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const { ordering: t } = useStrings();
  const loggedIn = useAuth().status === 'authenticated';
  const pathname = usePathname();
  const mine = useOrderingWaitlist();
  const join = useJoinOrderingWaitlist();
  const joined = mine.data?.joined === true;
  const look = tone === 'dark' ? 'border border-gold-300/50 bg-white/10 text-gold-100 hover:bg-white/15' : '';

  if (joined) {
    return (
      <p className={cn('inline-flex items-center gap-2 text-sm font-medium', tone === 'dark' ? 'text-gold-200' : 'text-success', className)}>
        <Check className="size-4" aria-hidden />
        {t.notified}
      </p>
    );
  }
  if (!loggedIn) {
    return (
      <Button asChild variant={tone === 'dark' ? 'secondary' : 'secondary'} className={cn(look, className)}>
        <Link href={loginHref(pathname)}>
          <BellRing aria-hidden />
          {t.notifyMe}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      variant="secondary"
      className={cn(look, className)}
      loading={join.isPending}
      onClick={() =>
        join.mutate(undefined, {
          onSuccess: () => toast.success(t.notifiedToast),
          onError: (e) => toast.error(errorMessage(e)),
        })
      }
    >
      <BellRing aria-hidden />
      {t.notifyMe}
    </Button>
  );
}

/** Under the product price: ordering is not open yet (nothing while it is open or unknown). */
export function OrderingSoonNote({ className }: { className?: string }) {
  const { ordering: t } = useStrings();
  if (useOrderingOpen() !== false) return null;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm', className)}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gradient-to-b from-gold-50 to-gold-100/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-900">
        <Sparkles className="size-3.5 text-gold-500" aria-hidden />
        {t.priceNote}
      </span>
      <span className="text-muted">{t.priceNoteBody}</span>
    </p>
  );
}

/** In the price card (dark): ordering is not open yet; previews and try-ons are. */
export function OrderingComingSoon({ tone = 'dark' }: { tone?: 'light' | 'dark' }) {
  const { ordering: t } = useStrings();
  return (
    <div className="relative mt-5 space-y-3">
      <div
        aria-disabled
        className={cn(
          'flex min-h-12 w-full items-center justify-center gap-2 rounded-full border text-sm font-semibold tracking-wide',
          tone === 'dark' ? 'border-gold-300/50 bg-gold-200/10 text-gold-100' : 'border-gold-300 bg-gold-50 text-accent-900',
        )}
      >
        <Sparkles className="size-4" aria-hidden />
        {t.comingSoon}
      </div>
      <p className={cn('text-center text-xs leading-relaxed', tone === 'dark' ? 'text-sand-200/80' : 'text-muted')}>{t.comingSoonBody}</p>
      <div className="flex justify-center">
        <NotifyMeButton tone={tone} />
      </div>
    </div>
  );
}

/** The bag and checkout pages while ordering is closed. */
export function ComingSoonPage() {
  const { ordering: t } = useStrings();
  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-16">
      <div className="relative w-full max-w-xl overflow-hidden rounded-[1.75rem] bg-[radial-gradient(120%_140%_at_100%_0%,#7C2B3A_0%,#44111B_55%,#2E0D14_100%)] px-6 py-12 text-center text-sand-50 shadow-[0_40px_80px_-50px_rgba(46,13,20,0.95)] sm:px-12">
        <EightPointStar className="pointer-events-none absolute -end-14 -top-14 size-48 text-gold-300/[0.12]" />
        <Sparkles className="relative mx-auto size-7 text-gold-200" aria-hidden />
        <h1 className="relative mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">{t.pageTitle}</h1>
        <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-sand-200/85">{t.pageBody}</p>
        <div className="relative mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild variant="gold">
            <Link href="/abayas">{t.explore}</Link>
          </Button>
          <NotifyMeButton tone="dark" />
        </div>
      </div>
    </div>
  );
}
