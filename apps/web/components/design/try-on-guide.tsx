'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, m, type PanInfo } from 'framer-motion';
import { ArrowLeft, ArrowRight, Camera, Check, Clock, Ruler, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useLocale, useStrings } from '@/components/i18n/locale-provider';
import { StarPattern } from '@/components/ornament/geometric';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SEEN_KEY = 'abaya.tryon-guide-seen';

/** Has she seen the guide on this device? (Shown once, before her first try-on.) */
export function guideSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Private window: she may see it again next time.
  }
}

/** Each step's picture, drawn in the brand colours on the wine panel. */
function Art({ step }: { step: number }) {
  const card = 'flex flex-col items-center gap-2 rounded-2xl border border-gold-300/40 bg-white/[0.07] px-4 py-4 text-center backdrop-blur-sm';
  const disc = 'flex size-12 items-center justify-center rounded-full bg-[linear-gradient(160deg,#E9D49A_0%,#CCA24A_55%,#B48734_100%)] text-accent-950 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.6)]';
  const { tryOn } = useStrings();
  const p = tryOn.guide.steps[step]!.points;
  if (step === 0)
    return (
      <div className="grid w-full max-w-xs grid-cols-2 gap-3">
        <div className={card}>
          <span className={disc}><Camera className="size-5" aria-hidden /></span>
          <span className="text-xs font-medium text-gold-100">{p[0]}</span>
        </div>
        <div className={card}>
          <span className={disc}><UserRound className="size-5" aria-hidden /></span>
          <span className="text-xs font-medium text-gold-100">{p[1]}</span>
        </div>
      </div>
    );
  if (step === 1)
    return (
      <div className="relative h-44 w-28 overflow-hidden rounded-b-2xl rounded-t-full border border-gold-300/60 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own model photo, a small static file */}
        <img src="/try-on-demo/before.webp" alt="" className="size-full object-cover" />
        <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-full bg-accent-950/75 px-2 py-1 text-[10px] font-semibold text-gold-100 backdrop-blur">
          <Check className="size-3" aria-hidden />
          OK
        </span>
        {/* Corner marks: the whole body in the frame */}
        {['start-1 top-6 border-s-2 border-t-2', 'end-1 top-6 border-e-2 border-t-2', 'bottom-9 start-1 border-b-2 border-s-2', 'bottom-9 end-1 border-b-2 border-e-2'].map((c) => (
          <span key={c} aria-hidden className={cn('absolute size-4 border-gold-200', c)} />
        ))}
      </div>
    );
  if (step === 2)
    return (
      <div className="flex items-end gap-4">
        <span className={disc}><Ruler className="size-5" aria-hidden /></span>
        <div className="flex h-36 flex-col justify-between border-s-2 border-dashed border-gold-300/70 py-1 ps-3 text-start">
          {['160', '140', '120', '100'].map((n) => (
            <span key={n} className="flex items-center gap-2 text-[10px] tabular-nums text-gold-200/80">
              <span className="h-px w-3 bg-gold-300/80" />
              {n}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2 text-start">
          {p.map((t) => (
            <span key={t} className="rounded-full border border-gold-300/40 bg-white/[0.07] px-3 py-1 text-xs text-gold-100">{t}</span>
          ))}
        </div>
      </div>
    );
  return (
    <div className="flex items-center gap-4">
      <span className="relative flex size-20 items-center justify-center rounded-full border border-gold-300/50 bg-white/[0.06]">
        <span aria-hidden className="absolute inset-0 rounded-full border-2 border-gold-300 border-t-transparent motion-safe:animate-spin [animation-duration:2.4s]" />
        <Clock className="size-7 text-gold-200" aria-hidden />
      </span>
      <span className={disc}><ShieldCheck className="size-5" aria-hidden /></span>
    </div>
  );
}

/**
 * The first-time guide to the virtual try-on, before the try-on window opens: four short steps
 * (how to try it on, a good photo, made to measure, the wait and privacy) on a wine and gold
 * card. Back / Next with progress dots, a swipe on phones, Skip at any time, and "Got it, let's
 * try" at the end. Seen once per device (the try-on window's "How it works" shows it again).
 */
export function TryOnGuide({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { tryOn } = useStrings();
  const g = tryOn.guide;
  const rtl = useLocale() === 'ar';
  const [[step, dir], setStep] = useState<[number, number]>([0, 1]);
  const last = step === g.steps.length - 1;
  const go = (by: number) => setStep(([s]) => [Math.min(g.steps.length - 1, Math.max(0, s + by)), by]);
  const finish = () => {
    markSeen();
    setStep([0, 1]);
    onDone();
  };
  const onSwipe = (_: unknown, info: PanInfo) => {
    const pull = info.offset.x + info.velocity.x * 0.2;
    if (Math.abs(pull) < 50) return;
    go((pull < 0) !== rtl ? 1 : -1);
  };
  const s = g.steps[step]!;
  const slide = (d: number) => (rtl ? -d : d) * 40;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && finish()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-accent-950/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md overflow-hidden rounded-t-[1.75rem] bg-surface shadow-[0_40px_90px_-30px_rgba(46,13,20,0.8)] focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem] sm:data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">{g.label}</DialogPrimitive.Title>

          {/* The wine panel with the step's picture */}
          <div className="relative isolate flex h-56 items-center justify-center overflow-hidden bg-[radial-gradient(85%_90%_at_50%_40%,#7c2b3a_0%,#44111b_60%,#2a0b11_100%)] px-6 sm:h-60">
            <StarPattern className="-z-10 text-gold-300/[0.12]" size={56} />
            <span aria-hidden className="absolute left-1/2 top-1/2 -z-10 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-300/15 blur-3xl" />
            <p className="absolute start-5 top-4 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-200">
              <Sparkles className="size-3.5" aria-hidden />
              {g.eyebrow}
            </p>
            <button
              type="button"
              onClick={finish}
              className="absolute end-3 top-2.5 rounded-full px-3 py-1.5 text-xs font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200"
            >
              {g.skip}
            </button>
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <m.div
                key={step}
                custom={dir}
                initial={{ opacity: 0, x: slide(dir), scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: slide(-dir), scale: 0.96 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="mt-4 flex justify-center"
              >
                <Art step={step} />
              </m.div>
            </AnimatePresence>
          </div>

          {/* The words, swipeable on phones */}
          <m.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.12} onDragEnd={onSwipe} className="touch-pan-y px-6 pb-6 pt-5 sm:px-7">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <m.div
                key={step}
                initial={{ opacity: 0, x: slide(dir) * 0.6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: slide(-dir) * 0.6 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-[11.5rem]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-600">{g.stepOf(step + 1, g.steps.length)}</p>
                <h2 className="mt-1.5 font-display text-2xl font-semibold leading-tight text-accent-950 sm:text-[1.7rem]">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">{s.body}</p>
                <ul className="mt-3 space-y-1.5">
                  {s.points.map((pt) => (
                    <Point key={pt}>{pt}</Point>
                  ))}
                </ul>
              </m.div>
            </AnimatePresence>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5" aria-hidden>
                {g.steps.map((_, i) => (
                  <span
                    key={i}
                    className={cn('h-1.5 rounded-full transition-all duration-300', i === step ? 'w-6 bg-accent-800' : i < step ? 'w-1.5 bg-gold-400' : 'w-1.5 bg-sand-300')}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => go(-1)}>
                    <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
                    {g.back}
                  </Button>
                )}
                {last ? (
                  <Button variant="gold" onClick={finish}>
                    <Camera aria-hidden />
                    {g.gotIt}
                  </Button>
                ) : (
                  <Button onClick={() => go(1)}>
                    {g.next}
                    <ArrowRight className="rtl:-scale-x-100" aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          </m.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Point({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-neutral-800">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-gold-100 text-accent-800">
        <Check className="size-3" aria-hidden />
      </span>
      {children}
    </li>
  );
}
