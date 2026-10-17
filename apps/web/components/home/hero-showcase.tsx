'use client';

import type { DesignCard } from '@abaya/contracts';

import { m, type PanInfo } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link } from '@/components/i18n/navigation';
import { DesignImage } from '@/components/design/design-image';
import { useLocale, useStrings } from '@/components/i18n/locale-provider';
import { TiltCard } from '@/components/motion/tilt-card';
import { heroLooks } from '@/lib/hero';
import { tryOnHref } from '@/lib/try-on-link';
import { cn } from '@/lib/utils';

/** Each look rests long enough to be seen; the push-in runs for the same time. */
const INTERVAL_MS = 6000;
/**
 * Cinematic hero: one landscape card (4:3 on wide screens, like an editorial campaign) set
 * into the stage, with the newest looks dissolving into each other and slowly pushing in.
 * A landscape photo (made with Reframe in the Studio) is used when the design has one;
 * otherwise the portrait photo is shown from the top, so the face and sleeves stay in frame.
 * Nothing is drawn over the photo: swipe on phones and arrow keys move between looks, and the
 * photo is a quiet link to its design. Pauses on hover, focus and in a hidden tab.
 */
export function HeroShowcase({ designs }: { designs: DesignCard[] }) {
  const { brand, home } = useStrings();
  const rtl = useLocale() === 'ar';
  // The newest designs with a photo large enough (from the page's pool of recent designs); one with
  // no photo, a small photo, or a photo that fails to load is dropped.
  const [failed, setFailed] = useState<string[]>([]);
  const looks = heroLooks(designs, failed);
  const count = looks.length;
  const [rawIndex, setIndex] = useState(0);
  const index = count > 0 ? ((rawIndex % count) + count) % count : 0;
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const cycling = count > 1 && !paused && !reducedMotion;
  const dropFailed = (src: string) => setFailed((f) => (f.includes(src) ? f : [...f, src]));

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!cycling) return;
    const start = () => window.setInterval(() => setIndex((i) => i + 1), INTERVAL_MS);
    let timer = start();
    const onVisibility = () => {
      window.clearInterval(timer);
      if (!document.hidden) timer = start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [cycling, count]);

  if (count === 0) {
    return (
      <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl bg-sand-100 lg:aspect-[4/3]">
        <DesignImage src={null} alt={brand.name} name={brand.name} sizes="50vw" className="absolute inset-0" />
      </div>
    );
  }

  const active = looks[index]!;
  const go = (by: number) => setIndex(index + by);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (count < 2) return;
    if (e.key === 'ArrowRight') go(rtl ? -1 : 1);
    if (e.key === 'ArrowLeft') go(rtl ? 1 : -1);
  };
  /** A swipe (or a quick pull with the mouse) moves one look; the card itself springs back. */
  const onSwipe = (_: unknown, info: PanInfo) => {
    if (count < 2) return;
    const pull = info.offset.x + info.velocity.x * 0.2;
    if (Math.abs(pull) < 60) return;
    const forward = rtl ? pull > 0 : pull < 0;
    go(forward ? 1 : -1);
  };

  return (
    <div className="contents">
      {/* The card: set into the stage, landscape on wide screens, with a short entrance. On wide screens
          it sits just under the try-on banner, its height capped so the whole card fits on the first
          screen (a wide but short window would otherwise cut it off), and its width follows from the
          4:3 shape. */}
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={home.heroShowcaseLabel}
        tabIndex={0}
        onKeyDown={onKey}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
        }}
        ref={region}
        className="relative mt-10 aspect-[4/5] w-full focus-visible:outline-none motion-safe:animate-fade-in sm:aspect-[5/6] lg:absolute lg:end-[4%] lg:top-[8.5rem] lg:mt-0 lg:aspect-[4/3] lg:h-[min(36.75vw,calc(100svh-19rem),calc(100%-11rem))] lg:w-auto lg:max-w-[49%]"
      >
        <TiltCard max={2} className="h-full">
          <m.div
            className="relative h-full overflow-hidden rounded-[1.25rem] bg-sand-100 shadow-[0_40px_80px_-40px_rgba(107,31,42,0.45),0_80px_140px_-70px_rgba(35,28,23,0.35)]"
            drag={count > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.08}
            dragMomentum={false}
            onDragEnd={onSwipe}
          >
            {/* The slideshow: looks dissolve into each other, the current one pushing in slowly */}
            {looks.map((design, i) => {
              const current = i === index;
              const src = design.wideImageUrl ?? design.primaryImageUrl;
              return (
                <m.div
                  key={design.id}
                  aria-hidden={!current}
                  className="absolute inset-0"
                  initial={false}
                  animate={{ opacity: current ? 1 : 0 }}
                  transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={cn('absolute inset-0', current && !reducedMotion && 'motion-safe:animate-push-in')}>
                    <DesignImage
                      src={src}
                      alt={design.name}
                      name={design.name}
                      priority={i < 2}
                      sizes="(min-width: 1024px) 56vw, 100vw"
                      className="absolute inset-0"
                      imagePosition={design.wideImageUrl ? '50% 50%' : '50% 12%'}
                      onFail={dropFailed}
                    />
                  </div>
                </m.div>
              );
            })}

            {/* The photo is a quiet link to the design */}
            <Link href={`/abayas/${active.slug}`} aria-label={home.heroShowcaseLink(active.name)} className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80" />

            {/* The virtual try-on, on the photo itself: "See this abaya on you" for the look on screen */}
            <Link
              href={tryOnHref(active.slug)}
              aria-label={home.cardTryOnNamed(active.name)}
              className="group/try absolute bottom-4 start-4 z-20 inline-flex items-center gap-2.5 rounded-full border border-white/40 bg-accent-950/55 py-2 pe-4 ps-2 text-sm font-medium text-white shadow-[0_18px_40px_-16px_rgba(16,4,7,0.8)] backdrop-blur-md transition-colors hover:bg-accent-950/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 sm:bottom-6 sm:start-6"
            >
              <span className="relative flex size-8 items-center justify-center rounded-full bg-[linear-gradient(160deg,#E9D49A_0%,#CCA24A_55%,#B48734_100%)] text-accent-950">
                <span aria-hidden className="absolute inset-0 rounded-full bg-gold-300/60 motion-safe:animate-ping" />
                <Sparkles className="relative size-4" aria-hidden />
              </span>
              {home.heroTryOnChip}
              <ArrowRight className="size-4 transition-transform group-hover/try:translate-x-0.5 rtl:-scale-x-100" aria-hidden />
            </Link>
          </m.div>
        </TiltCard>
      </div>

    </div>
  );
}
