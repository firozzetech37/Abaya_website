'use client';

import type { DesignCard } from '@abaya/contracts';
import { m, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DesignImage } from '@/components/design/design-image';
import { useStrings } from '@/components/i18n/locale-provider';
import { Link } from '@/components/i18n/navigation';
import { BrandMark } from '@/components/layout/brand-mark';
import { EyebrowStar, MashrabiyaPattern } from '@/components/ornament/geometric';
import { cn } from '@/lib/utils';

const INTERVAL_MS = 6500;

/**
 * The atelier window beside the sign-in card: one tall arched photo of a real abaya (a different
 * one each visit, dissolving to the next every few seconds, slowly pushing in). On phones it is a
 * short band above the card so the form stays near the top.
 */
export function LoginShowcase({ looks, start }: { looks: DesignCard[]; start: number }) {
  const { auth: t } = useStrings();
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState<string[]>([]);
  const [index, setIndex] = useState(start);
  const shown = looks.filter((d) => !failed.includes(d.id));
  const count = shown.length;

  useEffect(() => {
    if (count < 2 || reduced) return;
    const id = window.setInterval(() => setIndex((i) => i + 1), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, reduced]);

  const current = count ? index % count : -1;
  const active = current >= 0 ? shown[current] : null;

  return (
    <div className="relative lg:sticky lg:top-24 lg:order-first lg:self-start">
      <div className="relative mx-auto h-56 w-full overflow-hidden rounded-[1.25rem] bg-sand-100 shadow-[0_40px_80px_-40px_rgba(107,31,42,0.45),0_80px_140px_-70px_rgba(35,28,23,0.35)] motion-safe:animate-fade-in sm:h-72 lg:h-auto lg:aspect-[4/5] lg:w-[min(100%,calc((100dvh-11rem)*0.8))] lg:rounded-b-[1.5rem] lg:rounded-t-full">
        {/* A thin gold arch drawn inside the frame: the brand's signature */}
        <span aria-hidden className="pointer-events-none absolute inset-x-[7%] bottom-0 top-[6%] z-20 rounded-t-full border border-gold-300/60" />

        {active ? (
          shown.map((d, i) => {
            const isCurrent = i === current;
            return (
              <m.div
                key={d.id}
                aria-hidden={!isCurrent}
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: isCurrent ? 1 : 0 }}
                transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className={cn('absolute inset-0', isCurrent && !reduced && 'motion-safe:animate-push-in')}>
                  <DesignImage
                    src={d.primaryImageUrl}
                    alt={d.name}
                    name={d.name}
                    priority={isCurrent}
                    sizes="(min-width: 1024px) 45vw, 100vw"
                    className="absolute inset-0"
                    imagePosition="50% 15%"
                    onFail={() => setFailed((f) => [...f, d.id])}
                  />
                </div>
              </m.div>
            );
          })
        ) : (
          // No published designs yet (or the API is down): the window stays an ornament.
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-accent-800 to-accent-950 text-gold-200">
            <MashrabiyaPattern size={64} className="text-gold-200/15" />
            <BrandMark draw className="relative h-24" />
          </div>
        )}

        {active && (
          <>
            <div aria-hidden className="absolute inset-x-0 bottom-0 z-20 h-2/5 bg-gradient-to-t from-neutral-950/75 via-neutral-950/30 to-transparent" />
            {count > 1 && (
              <div aria-hidden className="absolute end-5 top-5 z-30 flex gap-1.5 lg:inset-x-0 lg:justify-center">
                {shown.map((d, i) => (
                  <span key={d.id} className={cn('h-1 rounded-full transition-all duration-700', i === current ? 'w-6 bg-white/90' : 'w-1.5 bg-white/45')} />
                ))}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-4 p-5 text-white sm:p-7 lg:px-[12%] lg:pb-8">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-gold-200">
                  <EyebrowStar className="size-3" />
                  {t.caption}
                </p>
                <m.p
                  key={active.id}
                  initial={reduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-1.5 truncate font-display text-2xl leading-tight [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] sm:text-3xl"
                >
                  {active.name}
                </m.p>
              </div>
              <Link
                href={`/abayas/${active.slug}`}
                aria-label={t.view}
                title={t.view}
                className="group inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/10 backdrop-blur transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-scale-x-100" aria-hidden />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
