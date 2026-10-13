'use client';

import { ArrowRight, Camera, ChevronsLeftRight, ShieldCheck, Sparkles } from 'lucide-react';
import { type PointerEvent, useRef, useState } from 'react';
import { Link } from '@/components/i18n/navigation';
import { useLocale, useStrings } from '@/components/i18n/locale-provider';
import { StarPattern } from '@/components/ornament/geometric';
import { Button } from '@/components/ui/button';
import { tryOnHref } from '@/lib/try-on-link';

/** Our own model photo, and the same photo with another abaya put on by the AI (no customer photos). */
const BEFORE = '/try-on-demo/before.webp';
const AFTER = '/try-on-demo/after.webp';

/**
 * "See it on you before it is stitched": the virtual try-on as its own home section, right after
 * the hero (anchor #try-on, for the announcement bar). A before/after slider shows what it does,
 * three steps say how, and "Try it on now" opens the try-on on an abaya.
 */
export function TryOnFeature({ slug }: { slug: string | null }) {
  const { home } = useStrings();
  const t = home.tryOnFeature;
  return (
    <section id="try-on" aria-labelledby="try-on-title" className="relative isolate scroll-mt-24 overflow-hidden bg-accent-950 text-white">
      <StarPattern className="-z-10 text-gold-300/[0.07]" size={72} />
      <span aria-hidden className="absolute -start-40 top-1/3 -z-10 size-[520px] rounded-full bg-accent-700/40 blur-3xl" />
      <span aria-hidden className="absolute -end-32 -top-24 -z-10 size-[420px] rounded-full bg-gold-400/15 blur-3xl" />

      <div className="container grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-gold-300/40 bg-gold-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-200">
            <Sparkles className="size-3.5" aria-hidden />
            {t.eyebrow}
            <span className="rounded-full bg-gold-300 px-1.5 py-px text-[9px] tracking-[0.14em] text-accent-950">{home.newTag}</span>
          </p>
          <h2 id="try-on-title" className="mt-5 font-display text-4xl leading-[1.08] sm:text-5xl lg:text-[3.4rem]">
            {t.title}
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">{t.body}</p>

          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {t.steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
                <span className="flex size-8 items-center justify-center rounded-full bg-[linear-gradient(160deg,#E9D49A_0%,#CCA24A_55%,#B48734_100%)] font-display text-sm font-semibold text-accent-950">
                  {i + 1}
                </span>
                <p className="mt-3 font-display text-lg leading-tight">{s.title}</p>
                <p className="mt-1 text-sm leading-snug text-white/65">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" variant="gold" className="uppercase tracking-[0.12em]">
              <Link href={slug ? tryOnHref(slug) : '/abayas'}>
                <Camera aria-hidden />
                {t.cta}
              </Link>
            </Button>
            <Link href="/abayas" className="group inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-gold-200 hover:text-gold-100">
              {t.browse}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden />
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-white/55">
            <ShieldCheck className="size-4 shrink-0 text-gold-300" aria-hidden />
            {t.privacy}
          </p>
        </div>

        <BeforeAfter before={BEFORE} after={AFTER} labels={{ before: t.before, after: t.after, slider: t.sliderLabel }} note={t.demoNote} />
      </div>
    </section>
  );
}

/** Drag (or use the arrow keys on) the handle to compare the photo before and after the try-on. */
function BeforeAfter({ before, after, labels, note }: { before: string; after: string; labels: { before: string; after: string; slider: string }; note: string }) {
  const rtl = useLocale() === 'ar';
  const [pos, setPos] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const moveTo = (clientX: number) => {
    const r = frame.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((clientX - r.left) / r.width) * 100;
    setPos(Math.min(100, Math.max(0, rtl ? 100 - x : x)));
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };
  // The "after" picture covers the start side up to the handle (left in English, right in Arabic).
  const clip = rtl ? `inset(0 0 0 ${100 - pos}%)` : `inset(0 ${100 - pos}% 0 0)`;

  return (
    <figure className="mx-auto w-full max-w-md">
      <div
        ref={frame}
        className="relative aspect-[760/1284] cursor-ew-resize touch-none select-none overflow-hidden rounded-t-full rounded-b-[2rem] border border-gold-300/40 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.9)]"
        onPointerDown={down}
        onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static demo pair */}
        <img src={before} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-cover" />
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static demo pair */}
        <img src={after} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-cover" style={{ clipPath: clip }} />
        <span className="absolute start-4 top-[18%] rounded-full bg-accent-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-100 backdrop-blur">
          {labels.after}
        </span>
        <span className="absolute end-4 top-[18%] rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-950 backdrop-blur">
          {labels.before}
        </span>
        {/* The handle */}
        <span aria-hidden className="absolute inset-y-0 w-0.5 bg-gold-200 shadow-[0_0_12px_rgba(233,212,154,0.9)]" style={{ insetInlineStart: `${pos}%` }}>
          <span className="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-gold-200 bg-accent-950/80 text-gold-100 shadow-lg backdrop-blur rtl:translate-x-1/2">
            <ChevronsLeftRight className="size-5" />
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(pos)}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={labels.slider}
          className="absolute inset-0 size-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="mt-3 text-center text-xs text-white/45">{note}</figcaption>
    </figure>
  );
}
