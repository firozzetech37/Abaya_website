'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useStrings } from '@/components/i18n/locale-provider';
import { ArabesqueBorder, EightPointStar } from '@/components/ornament/geometric';
import { cn } from '@/lib/utils';
import { BrandMark } from './brand-mark';
import { CurtainCloth, type CurtainMotion } from './curtain-cloth';

/** The curtain stays closed at least this long: the mark draws itself and the welcome appears. */
const MIN_CLOSED_MS = 1900;
/** Never keep visitors waiting on a slow image or font. */
const MAX_CLOSED_MS = 3600;
/** The opening: a tug, the gather, then the bunches are drawn off into the wings. */
const OPENING_MS = 3800;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Slow to start as the cord takes up, a steady pull, then easing in as the cloth bunches. */
const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
/** The opening's choreography, from elapsed share 0 → 1. */
const choreograph = (p: number): CurtainMotion => ({
  tug: p < 0.12 ? Math.sin((p / 0.12) * Math.PI) : 0,
  open: easeInOutSine(clamp01((p - 0.08) / 0.74)),
  fade: smooth(0.82, 1, p),
});

const REDUCED = '(prefers-reduced-motion: reduce)';
const subscribeReduced = (cb: () => void) => {
  const q = window.matchMedia(REDUCED);
  q.addEventListener('change', cb);
  return () => q.removeEventListener('change', cb);
};
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );

/**
 * Entrance loader for full page loads: two velvet curtains (a WebGL cloth, curtain-cloth.tsx)
 * under a pleated valance with gold braid, scallops and an arabesque vine; gold tie-back tassels
 * hanging on the leading edges; and in the middle the brand mark drawing itself on two slowly
 * turning eight-point stars, lit by a lantern glow, with a welcome. While the page loads the
 * cloth breathes and leans towards the pointer, and a hover ripples it. When the page is ready
 * (or on a click, a key or a swipe) the folds tighten for a moment, then the curtains gather to
 * the sides with the tassels swinging, the page shows through the gap as it widens (no light or
 * glow of its own), the valance lifts away and the gathered cloth is drawn off into the wings.
 *
 * From the first paint the curtains are a still of this very scene (public/curtain/*.webp,
 * rendered from the same shader by scripts/render-curtain-still.mjs, preloaded in the layout);
 * the live cloth starts from the same pose and fades in over it, so nothing changes to the eye.
 * Where WebGL is missing the still itself slides open; a plain fade for reduced motion. Rendered on the server so it covers the page before the first
 * paint, and only shown when JavaScript runs (`.js` class, set in the layout) so it can never get
 * stuck. Client-side navigation keeps the layout mounted, so it plays once per page load.
 */
export function CurtainLoader() {
  const { brand, common, nav, auth } = useStrings();
  const locale = useLocale();
  const [phase, setPhase] = useState<'closed' | 'opening' | 'done'>('closed');
  const [webgl, setWebgl] = useState(true);
  const [clothReady, setClothReady] = useState(false);
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const motion = useRef<CurtainMotion>({ open: 0, tug: 0, fade: 0 });
  const opened = useRef(false);
  const openNow = useRef<() => void>(() => undefined);

  useEffect(() => {
    const prefersReduced = window.matchMedia(REDUCED).matches;
    const mountedAt = performance.now();
    const timers: number[] = [];
    let frame = 0;

    const start = (wait: number) => {
      if (opened.current) return;
      opened.current = true;
      timers.push(
        window.setTimeout(() => {
          setPhase('opening');
          if (prefersReduced) {
            timers.push(window.setTimeout(() => setPhase('done'), 450));
            return;
          }
          const t0 = performance.now();
          const tick = () => {
            const p = Math.min(1, (performance.now() - t0) / OPENING_MS);
            const m = choreograph(p);
            motion.current = m;
            // The tassels (their swing, their exit into the wings) and the valance ride on the same numbers.
            root.current?.style.setProperty('--curtain-open', m.open.toFixed(4));
            root.current?.style.setProperty('--curtain-fade', m.fade.toFixed(4));
            if (p < 1) frame = requestAnimationFrame(tick);
            else setPhase('done');
          };
          frame = requestAnimationFrame(tick);
        }, wait),
      );
    };
    const whenReady = () => start(prefersReduced ? 0 : Math.max(0, MIN_CLOSED_MS - (performance.now() - mountedAt)));
    openNow.current = () => start(0);

    if (document.readyState === 'complete') whenReady();
    else window.addEventListener('load', whenReady, { once: true });
    timers.push(window.setTimeout(whenReady, MAX_CLOSED_MS));

    // A click, a key or a swipe pulls the curtains open early.
    const onKey = () => openNow.current();
    let touchX: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchX = e.touches[0]?.clientX ?? null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const x = e.changedTouches[0]?.clientX;
      if (touchX !== null && x !== undefined && Math.abs(x - touchX) > 60) openNow.current();
      touchX = null;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('load', whenReady);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      timers.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(frame);
    };
  }, []);

  const onUnsupported = useCallback(() => setWebgl(false), []);
  const onReady = useCallback(() => setClothReady(true), []);
  if (phase === 'done') return null;
  const opening = phase === 'opening';
  const cloth = webgl && !reduced;

  return (
    <div ref={root} className={cn('curtain-loader', opening && 'is-opening', cloth && clothReady && 'has-cloth')} onClick={() => openNow.current()}>
      <p role="status" className="sr-only">
        {opening ? '' : common.loading}
      </p>

      {/* The still of the closed curtain: there from the first paint, under the live cloth, and the fallback without WebGL */}
      <div className="curtain-still curtain-still-left" aria-hidden />
      <div className="curtain-still curtain-still-right" aria-hidden />
      {cloth && <CurtainCloth motion={motion} onReady={onReady} onUnsupported={onUnsupported} />}

      {/* Gold tie-backs hanging on the leading edges; they ride the edge and swing as the curtains gather */}
      {(['left', 'right'] as const).map((side) => (
        <div key={side} className={`curtain-tassel curtain-tassel-${side}`} aria-hidden>
          <div className="curtain-tassel-swing">
            <Tassel id={`tassel-${side}`} />
          </div>
        </div>
      ))}

      {/* In the middle: a lantern glow, the mark drawing itself on two turning stars, and a welcome */}
      <div className="curtain-centre" aria-hidden>
        <span className="curtain-lantern" />
        <div className="relative flex size-40 items-center justify-center sm:size-48">
          <EightPointStar className="curtain-star absolute inset-0 size-full text-gold-300/75 motion-safe:animate-[spin_70s_linear_infinite]" />
          <EightPointStar className="curtain-star absolute inset-[14%] size-[72%] text-gold-200/55 motion-safe:animate-[spin_100s_linear_infinite_reverse]" />
          <BrandMark draw className="relative h-14 text-gold-100 drop-shadow-[0_0_14px_rgba(221,187,107,0.45)] sm:h-[4.25rem]" />
        </div>
        <p className="curtain-welcome mt-6 font-display text-3xl text-gold-100 sm:text-4xl">{locale === 'ar' ? brand.name : auth.eyebrow}</p>
        <p className="curtain-welcome-2 mt-1.5 text-[11px] uppercase tracking-[0.4em] text-gold-300/85">{locale === 'ar' ? 'عباية أتيليه' : 'أهلًا بكِ'}</p>
        <span className="curtain-progress mt-7" />
      </div>

      {/* The valance: a pleated swag on its rod, gold braid, scallops with gold trim and drops, the vine */}
      <div className="curtain-pelmet" aria-hidden>
        <div className="curtain-pelmet-text">
          <span className="font-display text-2xl tracking-wide text-gold-100 sm:text-3xl">{brand.name}</span>
          <span className="mt-1 text-[9px] uppercase tracking-[0.5em] text-gold-300 sm:text-[10px]">{nav.tagline}</span>
        </div>
        <ArabesqueBorder className="absolute inset-x-0 bottom-2 h-3 text-gold-300/75" />
      </div>
    </div>
  );
}

/** A gold tie-back: a twisted cord, a rounded head, a wrapped neck and a full skirt of threads. */
function Tassel({ id }: { id: string }) {
  const strands = Array.from({ length: 19 }, (_, i) => {
    const x0 = 21 + i * 1.2;
    const splay = (x0 - 32) * 1.7;
    const len = 68 + ((i * 7) % 5) * 3 + (i % 2) * 2;
    return { d: `M${x0} 92 Q${(x0 + 32 + splay) / 2 + (i % 3) - 1} ${92 + len * 0.55} ${32 + splay} ${92 + len}`, i };
  });
  return (
    <svg viewBox="0 0 64 176" className="h-36 w-auto sm:h-44" aria-hidden>
      <defs>
        <radialGradient id={`${id}-head`} cx="36%" cy="30%" r="72%">
          <stop offset="0" stopColor="#FBEFC9" />
          <stop offset="0.4" stopColor="#D9B86A" />
          <stop offset="1" stopColor="#6F4A17" />
        </radialGradient>
        <linearGradient id={`${id}-cord`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7E561E" />
          <stop offset="0.5" stopColor="#F3DFA6" />
          <stop offset="1" stopColor="#7E561E" />
        </linearGradient>
        <linearGradient id={`${id}-strand`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9C7129" />
          <stop offset="0.55" stopColor="#E9D193" />
          <stop offset="1" stopColor="#B48734" />
        </linearGradient>
        <linearGradient id={`${id}-neck`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8A5F22" />
          <stop offset="0.5" stopColor="#E6CD8E" />
          <stop offset="1" stopColor="#8A5F22" />
        </linearGradient>
      </defs>
      {/* The cord, twisted, looping down from the curtain's edge */}
      <path d="M32 0c-15 10-23 22-23 36 0 10 9 16 23 16s23-6 23-16c0-14-8-26-23-36" fill="none" stroke={`url(#${id}-cord)`} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M32 0c-15 10-23 22-23 36 0 10 9 16 23 16s23-6 23-16c0-14-8-26-23-36" fill="none" stroke="rgba(60,30,0,0.45)" strokeWidth="5.5" strokeDasharray="2.5 5.5" strokeLinecap="round" />
      {/* The head, with a small cap */}
      <ellipse cx="32" cy="55" rx="7" ry="3.5" fill="#B48734" />
      <ellipse cx="32" cy="69" rx="13.5" ry="15.5" fill={`url(#${id}-head)`} />
      <path d="M22 62c3-6 10-9 17-6" fill="none" stroke="rgba(255,245,215,0.5)" strokeWidth="1.2" strokeLinecap="round" />
      {/* The wrapped neck */}
      <rect x="19.5" y="82" width="25" height="12" rx="3" fill={`url(#${id}-neck)`} />
      <path d="M19.5 85.5h25M19.5 89h25M19.5 92.5h25" stroke="rgba(60,30,0,0.4)" strokeWidth="1" />
      <path d="M19.5 84h25M19.5 87.5h25M19.5 91h25" stroke="rgba(255,240,200,0.45)" strokeWidth="0.8" />
      {/* The skirt: a darker layer behind, the lit threads in front */}
      <g className="curtain-tassel-skirt" fill="none" strokeLinecap="round">
        <g stroke="#6F4A17" strokeWidth="1.8" opacity="0.8" transform="translate(0 3)">
          {strands.map((s) => (
            <path key={`b${s.i}`} d={s.d} />
          ))}
        </g>
        <g stroke={`url(#${id}-strand)`} strokeWidth="1.6">
          {strands.map((s) => (
            <path key={s.i} d={s.d} />
          ))}
        </g>
      </g>
    </svg>
  );
}
