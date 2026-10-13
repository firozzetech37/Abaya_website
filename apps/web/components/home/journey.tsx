'use client';

import type { DesignCard } from '@abaya/contracts';
import { m, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowLeft, ArrowRight, Camera, RefreshCcw, Sparkles } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { DesignImage } from '@/components/design/design-image';
import { useLocale, useStrings } from '@/components/i18n/locale-provider';
import { EyebrowStar, MashrabiyaPattern } from '@/components/ornament/geometric';
import { cn } from '@/lib/utils';
import { JourneyArt } from './journey-art';
import { SilhouetteSketch } from './silhouette-sketch';

const TRUST_ICONS = [Camera, RefreshCcw, Sparkles];
/** Where each step looks on a full-length design photo (CSS crops of real photos; sketch and pattern are drawn). */
const CROPS: ({ position: string; scale: number } | null)[] = [
  null,
  { position: '50% 70%', scale: 2.4 },
  null,
  { position: '50% 96%', scale: 2.6 },
  { position: '26% 46%', scale: 2.8 },
  { position: '50% 34%', scale: 2.2 },
  { position: '50% 10%', scale: 1 },
];
/** Screens of scrolling the pinned section takes beyond its own height, and the share of that held still at each end. */
const GLIDE_SCREENS = 2.5;
const HOLD = 0.12;
const PER_VIEW = 3;
/** Pinned: the cards are sized by the viewport height so they fill tall screens too (width follows the 6:7 arch). */
const CARD_H = 'h-[min(52vh,640px)]';
const SPRING = { stiffness: 120, damping: 28, mass: 0.9, restDelta: 0.001 } as const;

/**
 * "From sketch to you": the seven atelier steps as arched cards driven by the scroll. On wide
 * screens the section pins for two and a half screens: scrolling down glides the rail from the
 * first card to the last (a spring on the scroll position, with a short hold at each end and a
 * soft landing on the nearest card), scrolling up glides it back. The card nearest the first slot
 * stands forward and plays its craft motion; a running stitch under the rail shows where you are,
 * with the needle moving along it. Arrows, clicks and the keyboard scroll the page to a card. On
 * phones and for reduced motion the row is a free swipe strip with snap.
 */
export function Journey({ designs, stepImages = [] }: { designs: DesignCard[]; stepImages?: (string | null)[] }) {
  const { home } = useStrings();
  const rtl = useLocale() === 'ar';
  const reduced = useReducedMotion() ?? false;
  const steps = home.journey;
  const n = steps.length;
  const photos = designs.filter((d) => d.primaryImageUrl && !d.primaryImageUrl.includes('/seed/'));
  const track = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const [wide, setWide] = useState(false);
  // One card plus its gap, in px (the cards are sized by the viewport height when pinned).
  const [stepPx, setStepPx] = useState(0);
  // Where the rail was last sent, so two quick arrow presses move two cards (the scroll may not have started yet).
  const [heading, setHeading] = useState<number | null>(null);

  const pinned = wide && !reduced;

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => {
      const card = el.firstElementChild as HTMLElement | null;
      if (card) setStepPx(card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0'));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const q = window.matchMedia('(min-width: 1024px)');
    const update = () => setWide(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);

  // ── Wide screens: the scroll drives the rail ──
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  const progress = useSpring(scrollYProgress, SPRING);
  // 0 → 1 across the glide, flat during the holds.
  const glide = useTransform(progress, [0, HOLD, 1 - HOLD, 1], [0, 0, 1, 1]);
  const x = useTransform(glide, (g: number): number => (rtl ? 1 : -1) * g * (n - PER_VIEW) * stepPx);
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (!pinned) return;
    const g = Math.min(1, Math.max(0, (p - HOLD) / (1 - 2 * HOLD)));
    const k = Math.round(g * (n - 1));
    setActive(k);
    setHeading((h) => (h === k ? null : h));
  });
  const scrollTopFor = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return 0;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const span = el.offsetHeight - window.innerHeight;
      return top + (HOLD + ((1 - 2 * HOLD) * i) / (n - 1)) * span;
    },
    [n],
  );
  // Soft landing: once scrolling stops inside the glide, ease to the nearest card.
  useEffect(() => {
    if (!pinned) return;
    let timer = 0;
    const settle = () => {
      const el = track.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const span = el.offsetHeight - window.innerHeight;
      const p = (window.scrollY - top) / span;
      if (p <= HOLD || p >= 1 - HOLD) return;
      const nearest = Math.round(((p - HOLD) / (1 - 2 * HOLD)) * (n - 1));
      const target = scrollTopFor(nearest);
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
  }, [pinned, n, scrollTopFor]);

  // ── Phones: a native swipe strip; the active card follows its scroll ──
  const onStripScroll = () => {
    const el = strip.current;
    if (!el || pinned) return;
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return;
    const step = card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0');
    const k = Math.min(n - 1, Math.max(0, Math.round(Math.abs(el.scrollLeft) / step)));
    setActive(k);
    setHeading((h) => (h === k ? null : h));
  };

  const goTo = (i: number) => {
    const k = Math.min(n - 1, Math.max(0, i));
    setHeading(k);
    if (pinned) {
      window.scrollTo({ top: scrollTopFor(k), behavior: 'smooth' });
      return;
    }
    const el = strip.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return setActive(k);
    const step = card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0');
    el.scrollTo({ left: (rtl ? -1 : 1) * k * step, behavior: reduced ? 'auto' : 'smooth' });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') goTo(active + (rtl ? -1 : 1));
    else if (e.key === 'ArrowLeft') goTo(active + (rtl ? 1 : -1));
    else return;
    e.preventDefault();
  };

  const controls = (
    <div className="flex items-center gap-3">
      <p className="font-display text-sm tabular-nums text-white/70">{home.reelCounter(active + 1, n)}</p>
      <ArrowButton label={home.journeyPrev} onClick={() => goTo((heading ?? active) - 1)}>
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
      </ArrowButton>
      <ArrowButton label={home.journeyNext} onClick={() => goTo((heading ?? active) + 1)}>
        <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
      </ArrowButton>
    </div>
  );

  return (
    <section id="how-it-works" className="relative scroll-mt-20 bg-accent-900 text-white">
      <div ref={track} className="relative" style={pinned ? { height: `calc(${1 + GLIDE_SCREENS} * 100vh)` } : undefined}>
        <div className={cn('relative overflow-hidden', pinned && 'sticky top-0 flex h-screen flex-col justify-center pt-16')}>
          <div aria-hidden className="bg-weave absolute inset-0" />
          <MashrabiyaPattern size={60} className="text-gold-300/[0.08]" />
          <div aria-hidden className="absolute -right-40 top-0 size-[520px] rounded-full bg-accent-700/40 blur-3xl" />
          <div aria-hidden className="absolute -left-40 bottom-0 size-[420px] rounded-full bg-accent-800/60 blur-3xl" />

          <div className={cn('container relative', pinned ? 'py-8' : 'py-20 sm:py-24')}>
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
              <div className="max-w-2xl">
                <p className="flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.28em] text-accent-200">
                  <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold-300 rtl:bg-gradient-to-l" aria-hidden />
                  <EyebrowStar className="text-gold-300" />
                  {home.journeyEyebrow}
                </p>
                <h2 className={cn('mt-3 font-display leading-[1.05]', pinned ? 'text-3xl xl:text-4xl' : 'text-4xl sm:text-5xl')}>{home.journeyTitle}</h2>
                <p className={cn('mt-3 max-w-xl text-accent-100/85', pinned && 'text-sm')}>{home.journeyBody}</p>
              </div>
              {!pinned && controls}
            </div>

            {/* The rail */}
            <div
              role="group"
              aria-roledescription="carousel"
              aria-label={home.journeyEyebrow}
              tabIndex={0}
              onKeyDown={onKey}
              className={cn('relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/70 focus-visible:ring-offset-8 focus-visible:ring-offset-accent-900', pinned ? 'mt-6' : 'mt-10 sm:mt-12')}
            >
              <m.ol
                ref={strip}
                onScroll={onStripScroll}
                style={pinned ? { x } : undefined}
                className={cn(
                  'flex',
                  pinned
                    ? 'gap-[3%]'
                    : '-mx-4 snap-x snap-mandatory gap-[4%] overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:gap-[3%] lg:mx-0 lg:px-0',
                )}
              >
                {steps.map((step, i) => {
                  const isActive = i === active;
                  return (
                    <m.li
                      key={step.title}
                      className={cn('shrink-0', pinned ? cn('w-auto', CARD_H) : 'w-[82%] snap-start sm:w-[46%] lg:w-[31%]')}
                      animate={reduced ? undefined : { scale: isActive ? 1 : 0.95, opacity: isActive ? 1 : 0.6, y: isActive ? 0 : 8 }}
                      transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                    >
                      <button
                        type="button"
                        onClick={() => goTo(i)}
                        aria-current={isActive ? 'step' : undefined}
                        aria-label={`${home.journeyStepOf(i + 1, n)}: ${step.title}`}
                        className="block h-full w-full rounded-b-[1.5rem] rounded-t-full text-start focus-visible:outline-none"
                      >
                        <StepCard index={i} step={step} when={home.journeyWhen[i] ?? ''} image={stepImages[i] ?? null} photo={photos[i % Math.max(photos.length, 1)] ?? null} active={isActive} tall={pinned} />
                      </button>
                    </m.li>
                  );
                })}
              </m.ol>
            </div>

            {/* The running stitch under the rail: seven stops, the needle at the active one (with the arrows when pinned) */}
            <div className={cn('flex items-center justify-center gap-8', pinned ? 'mt-6' : 'mt-8')}>
            <div aria-hidden className="relative h-8 w-full max-w-md">
              <svg className="absolute inset-x-0 top-1/2 h-px w-full overflow-visible" viewBox="0 0 100 1" preserveAspectRatio="none">
                <line x1="0" y1="0.5" x2="100" y2="0.5" stroke="rgba(255,255,255,0.15)" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1="0.5" x2="100" y2="0.5" stroke="rgb(221 187 107)" strokeDasharray="6 5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="opacity-80" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-between">
                {steps.map((step, i) => (
                  <button
                    key={step.title}
                    type="button"
                    tabIndex={-1}
                    onClick={() => goTo(i)}
                    aria-label={step.title}
                    className={cn('size-2.5 rounded-full border transition-[background-color,transform] duration-500', i <= active ? 'scale-110 border-gold-300 bg-gold-300' : 'border-white/40 bg-accent-900')}
                  />
                ))}
              </div>
              {!reduced && (
                <m.span
                  className="absolute top-1/2 -mt-3 size-6 text-gold-100 drop-shadow-[0_0_6px_rgba(221,187,107,0.8)]"
                  animate={rtl ? { right: `${(active / (n - 1)) * 100}%` } : { left: `${(active / (n - 1)) * 100}%` }}
                  style={{ translateX: rtl ? '50%' : '-50%', translateY: '-45%' }}
                  transition={{ type: 'spring', stiffness: 140, damping: 20 }}
                >
                  <svg viewBox="0 0 24 24" className={cn('size-6', rtl ? 'rotate-[135deg]' : 'rotate-45')} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M3 21 17 7" />
                    <path d="M17 7l3-3M15 5l4 4" />
                    <circle cx="18.5" cy="5.5" r="1.3" />
                  </svg>
                </m.span>
              )}
            </div>
            {pinned && controls}
            </div>

            {/* What the journey promises */}
            <ul className={cn('flex flex-wrap justify-center gap-2.5', pinned ? 'mt-4' : 'mt-8')}>
              {home.journeyTrust.map((t, i) => {
                const Icon = TRUST_ICONS[i] ?? Sparkles;
                return (
                  <li key={t} className="inline-flex items-center gap-2 rounded-full border border-gold-300/40 bg-white/5 px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-gold-100 backdrop-blur">
                    <Icon className="size-3.5 text-gold-300" aria-hidden />
                    {t}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArrowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex size-11 items-center justify-center rounded-full border border-gold-300/50 bg-white/5 text-gold-100 transition-colors hover:bg-gold-300 hover:text-accent-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/70"
    >
      {children}
    </button>
  );
}

/** One step's arched card: its picture (a real photo cropped to the detail, or a gold line drawing), craft motion, number, name and line. */
function StepCard({
  index,
  step,
  when,
  image,
  photo,
  active,
  tall = false,
}: {
  index: number;
  step: { title: string; body: string };
  when: string;
  /** A dedicated step picture from public/journey, when the atelier has added one. */
  image: string | null;
  photo: DesignCard | null;
  active: boolean;
  /** Sized by height (the pinned rail) rather than by width. */
  tall?: boolean;
}) {
  const crop = CROPS[index] ?? null;
  const drawn = !image && (!crop || !photo);
  return (
    <div
      data-journey-card={index}
      className={cn(
        'relative aspect-[6/7] overflow-hidden rounded-b-[1.5rem] rounded-t-full bg-accent-950 transition-shadow duration-700',
        tall && 'h-full',
        active ? 'shadow-[0_0_0_1px_rgba(221,187,107,0.55),0_50px_100px_-50px_rgba(0,0,0,0.9)]' : 'shadow-[0_30px_60px_-40px_rgba(0,0,0,0.7)]',
      )}
    >
      {drawn ? (
        <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-b from-accent-800 to-accent-950 pb-[34%] pt-[12%] text-gold-300">
          <MashrabiyaPattern size={44} className="text-gold-200/10" />
          {index === 0 ? <SilhouetteSketch style="CLOSED" className={cn('relative', active && 'journey-sketch')} /> : <JourneyArt step={index} active={active} className="relative h-[50%]" />}
        </div>
      ) : image ? (
        <>
          <DesignImage src={image} alt="" name={step.title} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 82vw" className="absolute inset-0 [&_img]:transition-transform [&_img]:duration-[2400ms] [&_img]:ease-out" />
          <span aria-hidden className="absolute inset-0 bg-accent-950/20" />
          <JourneyArt step={index} active={active} className="absolute end-[9%] top-[10%] h-[20%] text-gold-200/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
        </>
      ) : (
        <>
          <DesignImage src={photo!.primaryImageUrl} alt="" name={photo!.name} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 82vw" className="absolute inset-0" imagePosition={crop!.position} />
          <style>{`[data-journey-card="${index}"] img{transform:scale(${crop!.scale});transform-origin:${crop!.position}}`}</style>
          <span aria-hidden className="absolute inset-0 bg-accent-950/25" />
          <JourneyArt step={index} active={active} className="absolute end-[9%] top-[10%] h-[20%] text-gold-200/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
        </>
      )}
      <span aria-hidden className="pointer-events-none absolute inset-x-[7%] bottom-0 top-[6%] rounded-t-full border border-gold-300/50" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-accent-950 via-accent-950/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
        <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-gold-200">
          <span className="font-display text-sm normal-case tracking-normal">{String(index + 1).padStart(2, '0')}</span>
          <span className="h-px w-4 bg-gold-300/60" aria-hidden />
          {when}
        </p>
        <h3 className="mt-1.5 font-display text-2xl leading-tight sm:text-3xl">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-white/80">{step.body}</p>
      </div>
    </div>
  );
}
