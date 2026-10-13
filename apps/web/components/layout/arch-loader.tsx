'use client';

import { useEffect, useState } from 'react';
import { useStrings } from '@/components/i18n/locale-provider';
import { StarPattern } from '@/components/ornament/geometric';
import { cn } from '@/lib/utils';


/** The arch draws itself and the name rises before it may open. */
const MIN_SHOWN_MS = 1500;
/** Never keep anyone waiting on a slow image or font. */
const MAX_SHOWN_MS = 3000;
/** The doorway opening (globals.css `arch-open`). */
const OPENING_MS = 900;

/**
 * Entrance loader on every full page load, on deep wine with a drifting gold lattice, a warm glow
 * and rising gold dust (opening the site, a reload; moving between pages
 * inside the site keeps the layout mounted, so it does not replay): the atelier's gold arch draws itself (outer arch, inner arch,
 * then the dot), the name and "Made to measure" rise beneath it, and when the page is ready the
 * page shows through the arch as it opens like a doorway. A click or key opens it at once.
 * Rendered on the server so it covers the page from the first paint; only shown when JS runs
 * (`.js`), so it can never get stuck. Reduced motion: no drawing, a short fade.
 */
export function ArchLoader() {
  const { brand, nav } = useStrings();
  const [phase, setPhase] = useState<'shown' | 'opening' | 'done'>('shown');

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shownAt = performance.now();
    const timers: number[] = [];
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      setPhase('opening');
      timers.push(window.setTimeout(() => setPhase('done'), reduced ? 320 : OPENING_MS));
    };
    const whenReady = () => timers.push(window.setTimeout(open, Math.max(0, (reduced ? 300 : MIN_SHOWN_MS) - (performance.now() - shownAt))));
    if (document.readyState === 'complete') whenReady();
    else window.addEventListener('load', whenReady, { once: true });
    timers.push(window.setTimeout(open, MAX_SHOWN_MS));
    window.addEventListener('keydown', open, { once: true });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('load', whenReady);
      window.removeEventListener('keydown', open);
    };
  }, []);

  if (phase === 'done') return null;
  return (
    <div
      aria-hidden
      className={cn('arch-loader', phase === 'opening' && 'is-opening')}
      onPointerDown={() => setPhase((p) => (p === 'shown' ? 'opening' : p))}
      onAnimationEnd={(e) => e.target === e.currentTarget && setPhase('done')}
    >
      {/* Deep wine, the gold girih lattice slowly drifting, a warm glow, a soft vignette */}
      <div className="arch-loader-pattern">
        <StarPattern className="text-gold-300" size={72} />
      </div>
      <span className="arch-loader-glow" />
      <span className="arch-loader-vignette" />
      {/* Gold dust rising (fixed positions, the same on server and client) */}
      {DUST.map((d, i) => (
        <span
          key={i}
          className="arch-loader-dust"
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.s, height: d.s, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` }}
        />
      ))}

      <div className="arch-loader-centre">
        <svg viewBox="-4 -6 40 50" className="arch-loader-mark" fill="none">
          <defs>
            <linearGradient id="arch-loader-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBF0CF" />
              <stop offset="45%" stopColor="#E3C27A" />
              <stop offset="100%" stopColor="#B48734" />
            </linearGradient>
          </defs>
          <path d="M2.5 39V16.5a13.5 13.5 0 0 1 27 0V39" stroke="url(#arch-loader-gold)" strokeWidth="1.5" strokeLinecap="round" pathLength={1} />
          <path className="arch-inner" d="M8 39V18a8 8 0 0 1 16 0v21" stroke="url(#arch-loader-gold)" strokeWidth="1" strokeLinecap="round" opacity="0.75" pathLength={1} />
          {/* The keystone: a gold dot that twinkles into a small four-point star */}
          <g className="arch-loader-spark">
            <circle cx="16" cy="9" r="1.5" fill="#F5E2A8" />
            <path d="M16 4.6 16.7 8.3 20.4 9 16.7 9.7 16 13.4 15.3 9.7 11.6 9 15.3 8.3Z" fill="#FFF6DA" />
          </g>
        </svg>
        <span className="arch-loader-rule" />
        <p className="arch-loader-name mt-5 font-display text-4xl font-semibold sm:text-5xl">{brand.name}</p>
        <p className="arch-loader-tag mt-3 text-[11px] font-medium uppercase tracking-[0.38em] text-sand-100/80">{nav.tagline}</p>
      </div>
    </div>
  );
}

/** Gold dust: [left %, top %, size px, delay s, duration s]. */
const DUST = [
  [12, 78, 3, 0, 5.5], [22, 64, 2, 0.6, 6.5], [31, 88, 2, 1.2, 5], [44, 72, 3, 0.3, 6], [57, 84, 2, 0.9, 5.5],
  [66, 69, 3, 0.2, 6.8], [75, 90, 2, 1.4, 5.2], [84, 74, 3, 0.7, 6.2], [91, 60, 2, 1.1, 5.8], [8, 55, 2, 1.6, 6.4],
  [38, 58, 2, 1.9, 5.6], [70, 52, 2, 0.5, 6.6],
].map(([x, y, s, delay, dur]) => ({ x, y, s, delay, dur }));
