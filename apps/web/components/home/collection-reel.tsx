'use client';

import type { CollectionDto } from '@abaya/contracts';
import { m, type MotionValue, useInView, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DesignImage } from '@/components/design/design-image';
import { Link } from '@/components/i18n/navigation';
import { useLocale, useStrings } from '@/components/i18n/locale-provider';
import { EyebrowStar, StarPattern } from '@/components/ornament/geometric';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Panel = { kind: 'collection'; collection: CollectionDto } | { kind: 'design-your-own' };

/** True on a data-saver connection: the films are not fetched at all, the cover photo stands in. */
const subscribeNever = () => () => {};
const useSaveData = () =>
  useSyncExternalStore(
    subscribeNever,
    () => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData),
    () => false,
  );

/** Screens of scrolling during which the first and the last panel hold still, so the glide settles at both ends. */
const HOLD = 0.35;
const SPRING = { stiffness: 120, damping: 28, mass: 0.9, restDelta: 0.001 } as const;

/**
 * Collections as a cinematic reel. On wide screens the section pins to the viewport and the
 * panels glide sideways as the page scrolls (a spring on the scroll position), one full-screen
 * panel per collection with its looping video (uploaded in the admin) or, without one, its
 * newest photo slowly breathing. The collection name is cut out of the picture: the video
 * shows through the letters while the rest is dimmed. On phones, and for reduced motion, the
 * panels stack vertically with scroll-snap and videos stay as posters when motion is reduced.
 */
export function CollectionReel({ collections }: { collections: CollectionDto[] }) {
  const { home } = useStrings();
  const rtl = useLocale() === 'ar';
  const reduced = useReducedMotion() ?? false;
  const panels: Panel[] = [...collections.map((collection) => ({ kind: 'collection' as const, collection })), { kind: 'design-your-own' as const }];
  const n = panels.length;
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  const progress = useSpring(scrollYProgress, SPRING);
  // The page scrolls (n − 1 + 2·HOLD) screens while pinned: a hold, n − 1 screens of glide, a hold.
  const span = n - 1 + 2 * HOLD;
  const hold = HOLD / span;
  const end = `${(rtl ? 1 : -1) * (n - 1) * 100}vw`;
  const x = useTransform(progress, [0, hold, 1 - hold, 1], ['0vw', '0vw', end, end]);
  const rail = useTransform(progress, [hold, 1 - hold], [0, 1]);
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const t = Math.max(0, Math.min(1, (v - hold) / (1 - 2 * hold)));
    setActive(Math.round(t * (n - 1)));
  });
  const pinned = !reduced;
  const isWide = () => window.matchMedia('(min-width: 1024px)').matches;

  /** Where the pinned track starts on the page. */
  const trackTop = () => (track.current ? track.current.getBoundingClientRect().top + window.scrollY : 0);
  /** The page position at which panel `i` sits fully on screen. */
  const scrollTopFor = (i: number) => trackTop() + (i + HOLD) * window.innerHeight;

  /** Keyboard users tabbing into a panel bring it on screen. */
  const reveal = (i: number) => {
    if (!track.current || !pinned || !isWide()) return;
    window.scrollTo({ top: scrollTopFor(i), behavior: reduced ? 'auto' : 'smooth' });
  };

  // Soft landing: once scrolling stops inside the glide, ease to the nearest whole panel.
  useEffect(() => {
    if (!pinned) return;
    let timer = 0;
    const settle = () => {
      const el = track.current;
      if (!el || !isWide()) return;
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const rel = (window.scrollY - top) / vh;
      // Only between the two holds: at the ends the strip is already resting on a panel.
      if (rel <= HOLD || rel >= n - 1 + HOLD) return;
      const nearest = Math.round(rel - HOLD);
      const target = top + (nearest + HOLD) * vh;
      if (Math.abs(window.scrollY - target) > 2) window.scrollTo({ top: target, behavior: 'smooth' });
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 180);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, [pinned, n]);

  return (
    <section id="collections" aria-label={home.collectionsTitle} className="relative scroll-mt-20 bg-neutral-950 text-white">
      <a
        href="#after-collections"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-foreground"
      >
        {home.reelSkip}
      </a>
      <div ref={track} className={cn('relative', pinned && 'lg:h-[calc(var(--screens)*100vh)]')} style={{ '--screens': span + 1 } as React.CSSProperties}>
        <div className={cn('relative', pinned && 'lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden')}>
          {/* Section label and counter, fixed inside the pinned viewport */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 hidden items-start justify-between px-[5%] pt-28 lg:flex">
            <p className="flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.3em] text-white/75">
              <EyebrowStar className="text-gold-300" />
              {home.collectionsEyebrow}
            </p>
            <p className="font-display text-sm tabular-nums text-white/75">{home.reelCounter(active + 1, n)}</p>
          </div>

          <m.div
            className={cn('flex snap-y snap-mandatory flex-col', pinned && 'lg:h-full lg:snap-none lg:flex-row lg:[transform:translateX(var(--reel-x))]')}
            style={{ '--reel-x': pinned ? x : '0vw' } as React.CSSProperties}
          >
            {panels.map((panel, i) =>
              panel.kind === 'collection' ? (
                <CollectionPanel
                  key={panel.collection.id}
                  collection={panel.collection}
                  index={i}
                  count={n}
                  progress={progress}
                  reduced={reduced}
                  pinned={pinned}
                  onReveal={() => reveal(i)}
                />
              ) : (
                <DesignYourOwnPanel key="design-your-own" index={i} onReveal={() => reveal(i)} reduced={reduced} active={active === i} />
              ),
            )}
          </m.div>

          {/* Progress rail */}
          {pinned && (
            <div aria-hidden className="pointer-events-none absolute inset-x-[5%] bottom-6 z-30 hidden h-px bg-white/15 lg:block">
              <m.span className="absolute inset-y-0 start-0 origin-left bg-gold-300 rtl:origin-right" style={{ scaleX: rail, width: '100%' }} />
            </div>
          )}
        </div>
      </div>
      <span id="after-collections" />
    </section>
  );
}

/** One collection: its video (or breathing photo), the name cut out of it, and the details. */
function CollectionPanel({
  collection: c,
  index,
  count,
  progress,
  reduced,
  pinned,
  onReveal,
}: {
  collection: CollectionDto;
  index: number;
  count: number;
  progress: MotionValue<number>;
  reduced: boolean;
  pinned: boolean;
  onReveal: () => void;
}) {
  const { home } = useStrings();
  const ref = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const saveData = useSaveData();
  const film = Boolean(c.videoUrl) && !saveData;
  // The film fades in once its first frame is there; until then the panel is just its dark ground (no cover photo).
  const [ready, setReady] = useState(false);
  // The picture drifts a little slower than its frame while the reel moves (depth).
  const drift = useTransform(progress, (p) => `${(p * (count - 1) - index) * (pinned ? 5 : 0)}vw`);

  // Fetch early, as soon as the page is up: the first frame of every film, and more of the first one on wide screens.
  useEffect(() => {
    const el = video.current;
    if (!el || !film || el.getAttribute('src')) return;
    el.preload = index === 0 && window.innerWidth >= 1024 ? 'auto' : 'metadata';
    el.src = el.dataset.src ?? '';
    el.load();
  }, [film, index]);

  // Play only while on screen, never with reduced motion.
  useEffect(() => {
    const el = video.current;
    if (!el || !film) return;
    if (!inView || reduced) {
      el.pause();
      return;
    }
    void el.play().catch(() => undefined);
  }, [inView, reduced, film]);

  return (
    <article
      ref={ref}
      className="relative w-full shrink-0 snap-start overflow-hidden bg-neutral-950 max-lg:min-h-[86vh] lg:h-full lg:w-screen"
      aria-labelledby={`reel-${c.id}`}
    >
      {/* The picture: the film (no poster; it fades in from the dark ground once its first frame is there), or the cover photo slowly breathing */}
      <m.div className="absolute -inset-x-[6%] inset-y-0" style={{ x: drift }}>
        {film ? (
          <video
            ref={video}
            data-src={c.videoUrl ?? undefined}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden
            onLoadedData={() => setReady(true)}
            onPlaying={() => setReady(true)}
            className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out', ready ? 'opacity-100' : 'opacity-0')}
          />
        ) : (
          <div className={cn('absolute inset-0', !reduced && 'motion-safe:animate-breathe')}>
            <DesignImage src={c.coverImageUrl} alt="" name={c.name} sizes="100vw" className="absolute inset-0" />
          </div>
        )}
        {/* A light sweep and a few motes of dust, so a still photo still feels alive */}
        <span aria-hidden className="absolute inset-y-0 start-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent motion-safe:animate-glint" />
        {[18, 44, 71, 86, 30, 60].map((left, i) => (
          <span
            key={left}
            aria-hidden
            className="absolute size-1 rounded-full bg-gold-100/60 blur-[1px] motion-safe:animate-float"
            style={{ left: `${left}%`, top: `${20 + ((i * 23) % 60)}%`, animationDuration: `${9 + i * 2}s`, animationDelay: `${-i * 1.7}s` }}
          />
        ))}
      </m.div>

      {/* The name, cut out of the picture: white letters on a dark veil, multiplied over the video */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-neutral-950/60 px-[4%] mix-blend-multiply">
        <span className="max-w-full text-center font-display text-[15vw] uppercase leading-[0.95] tracking-[-0.01em] text-white lg:text-[11vw]">
          {c.name}
        </span>
      </div>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-neutral-950/85 via-neutral-950/30 to-transparent" />

      {/* The details, always readable */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-5 px-[5%] pb-14 lg:flex-row lg:items-end lg:justify-between lg:pb-16">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.26em] text-gold-200">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <span className="h-px w-6 bg-gold-300/60" aria-hidden />
            <span>{home.designsCount(c.designCount)}</span>
          </p>
          <h3 id={`reel-${c.id}`} className="mt-3 font-display text-4xl font-medium leading-tight sm:text-5xl">
            {c.name}
          </h3>
          {c.description && <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">{c.description}</p>}
          <Link
            href={`/collections/${c.slug}`}
            onFocus={onReveal}
            className="group mt-6 inline-flex items-center gap-3 rounded-full border border-white/40 bg-white/10 py-2 pe-6 ps-2 text-sm font-medium backdrop-blur transition-colors duration-300 hover:bg-white hover:text-accent-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 group-hover:rotate-45 group-hover:bg-accent-900 group-hover:text-white">
              <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </span>
            {home.reelView}
          </Link>
        </div>
        {(c.previewImageUrls ?? []).length > 0 && (
          <ul className="flex gap-2.5" aria-hidden>
            {(c.previewImageUrls ?? []).map((url, i) => (
              <li key={url} className="w-16 overflow-hidden rounded-md border border-white/20 sm:w-20" style={{ transform: `translateY(${i * -6}px)` }}>
                <DesignImage src={url} alt="" name={c.name} sizes="80px" className="aspect-[3/4]" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** The closing panel: the invitation to design your own, beside a mood film that melts into the burgundy. */
const DESIGN_VIDEO = '/video/design-your-own.mp4';

function DesignYourOwnPanel({ index, onReveal, reduced, active }: { index: number; onReveal: () => void; reduced: boolean; active: boolean }) {
  const { home } = useStrings();
  const ref = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const phoneVideo = useRef<HTMLVideoElement>(null);
  // On wide screens the reel knows which panel is up; on phones the panels stack, so watch the viewport.
  const inView = useInView(ref, { amount: 0.35 }) || active;
  const words = home.designYourOwn.split(' ');
  const last = words.pop();

  // Same rule as the collection films: play only on screen, never with reduced motion or data
  // saver (then it rests on its first frame). The film is atmosphere, not a product: no caption, no link.
  useEffect(() => {
    const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    for (const el of [video.current, phoneVideo.current]) {
      // Only the visible one (desktop window or phone backdrop) is loaded.
      if (!el || el.offsetParent === null) continue;
      if (!el.getAttribute('src')) el.setAttribute('src', el.dataset.src ?? '');
      if (!inView || reduced || saveData) el.pause();
      else void el.play().catch(() => undefined);
    }
  }, [inView, reduced]);

  return (
    <article ref={ref} className="relative flex w-full shrink-0 snap-start items-center overflow-hidden bg-accent-900 px-[5%] py-20 max-lg:min-h-[86vh] lg:h-full lg:w-screen lg:py-0">
      <StarPattern size={72} className="text-gold-300/[0.1]" />
      <span aria-hidden className="absolute -bottom-32 -left-24 size-[26rem] rounded-full bg-gold-500/15 blur-3xl" />

      {/* The film fills the end half of the panel edge to edge, dimmed like the collection films, with one soft seam towards the text */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 hidden w-1/2 overflow-hidden lg:block">
        <video ref={video} data-src={DESIGN_VIDEO} muted loop playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
        {/* The same dark veil and floor shadow as the collection panels */}
        <span className="absolute inset-0 bg-neutral-950/45" />
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-neutral-950/85 via-neutral-950/30 to-transparent" />
        {/* The seam: the burgundy of the text half bleeds a little way into the film */}
        <span className="absolute inset-y-0 start-0 w-[28%] bg-gradient-to-r from-accent-900 via-accent-900/55 to-transparent rtl:bg-gradient-to-l" />
        {/* A light sweep and a few motes of dust */}
        <span className="absolute inset-y-0 start-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent motion-safe:animate-glint" />
        {[18, 44, 71, 86, 30, 60].map((left, i) => (
          <span
            key={left}
            className="absolute size-1 rounded-full bg-gold-100/60 blur-[1px] motion-safe:animate-float"
            style={{ left: `${left}%`, top: `${20 + ((i * 23) % 60)}%`, animationDuration: `${9 + i * 2}s`, animationDelay: `${-i * 1.7}s` }}
          />
        ))}
      </div>
      {/* On phones the film is a soft backdrop behind the text */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden [mask-image:radial-gradient(ellipse_70%_60%_at_50%_45%,black_30%,transparent_100%)]">
        <video ref={phoneVideo} data-src={DESIGN_VIDEO} muted loop playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover object-top opacity-40" />
        <span className="absolute inset-0 bg-accent-900/40 mix-blend-multiply" />
      </div>

      <div className="relative w-full max-w-xl lg:w-1/2 lg:max-w-none lg:pe-[6%]">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.26em] text-gold-200">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <span className="h-px w-6 bg-gold-300/60" aria-hidden />
          <Wand2 className="size-3.5 text-gold-300" aria-hidden />
          <span>{home.heroBadge}</span>
        </p>
        <h3 className="mt-6 font-display text-5xl leading-[1.02] text-white sm:text-6xl xl:text-[5.5rem]">
          {words.join(' ')}{' '}
          <span className="relative inline-block">
            <em className="not-italic text-gold-100">{last}</em>
            {/* A gold thread draws under the last word when the panel comes into view */}
            <svg aria-hidden viewBox="0 0 120 12" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-3 w-full text-gold-400">
              <path d="M2 9C30 3 70 2 118 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" pathLength={1} className={cn(inView && 'hero-underline')} style={inView ? undefined : { strokeDasharray: 1, strokeDashoffset: 1 }} />
            </svg>
          </span>
        </h3>
        <p className="mt-5 max-w-md text-base leading-relaxed text-accent-100/85 sm:text-lg">{home.designYourOwnBody}</p>
        <span aria-hidden className="mt-7 block h-px w-24 bg-gradient-to-r from-gold-300/70 to-transparent rtl:bg-gradient-to-l" />
        <ul className="mt-6 flex flex-wrap gap-2" aria-label={home.designYourOwnDetailsLabel}>
          {home.designYourOwnDetails.map((d, i) => (
            <li
              key={d}
              className={cn('rounded-full border border-gold-300/40 bg-white/5 px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-gold-100 backdrop-blur', inView && 'motion-safe:animate-fade-up')}
              style={inView ? { animationDelay: `${200 + i * 90}ms` } : undefined}
            >
              {d}
            </li>
          ))}
        </ul>
        <Button asChild variant="gold" size="lg" className="mt-9">
          <Link href="/abayas" onFocus={onReveal}>
            {home.heroCta}
            <ArrowRight className="rtl:-scale-x-100" aria-hidden />
          </Link>
        </Button>
      </div>
    </article>
  );
}
