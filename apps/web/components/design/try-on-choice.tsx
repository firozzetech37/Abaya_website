'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ImageIcon, Sparkles, X } from 'lucide-react';
import { useStrings } from '@/components/i18n/locale-provider';
import { StarPattern } from '@/components/ornament/geometric';
import { cn } from '@/lib/utils';

export type TryOnVersion = 'ORIGINAL' | 'CUSTOM';

/**
 * When she has customised the abaya and clicks "Try it on": which one to put on her, the original
 * as photographed or her customised version (her preview picture when she made one; otherwise it
 * is made first, a minute more). Two picture cards on a wine and gold card.
 */
export function TryOnChoice({
  open,
  originalImageUrl,
  customImageUrl,
  changes,
  complete,
  onPick,
  onClose,
}: {
  open: boolean;
  originalImageUrl: string | null;
  customImageUrl: string | null;
  changes: string[];
  /** Every required option is chosen (a customised picture can be made). */
  complete: boolean;
  onPick: (v: TryOnVersion) => void;
  onClose: () => void;
}) {
  const { tryOn, common } = useStrings();
  const t = tryOn.choose;
  const card =
    'group flex flex-col overflow-hidden rounded-2xl border bg-surface text-start shadow-[0_18px_40px_-28px_rgba(46,13,20,0.7)] transition-[transform,border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 enabled:hover:-translate-y-1 enabled:hover:border-gold-400 enabled:hover:shadow-[0_26px_50px_-28px_rgba(46,13,20,0.8)] disabled:cursor-not-allowed disabled:opacity-60';
  const frame = 'relative block aspect-[3/4] w-full overflow-hidden rounded-b-xl rounded-t-full bg-sand-100';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-accent-950/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-surface shadow-[0_40px_90px_-30px_rgba(46,13,20,0.8)] focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem] sm:data-[state=open]:zoom-in-95"
        >
          <div className="relative isolate overflow-hidden bg-[radial-gradient(85%_120%_at_50%_0%,#7c2b3a_0%,#44111b_65%,#2a0b11_100%)] px-6 pb-6 pt-5 text-white">
            <StarPattern className="-z-10 text-gold-300/[0.12]" size={56} />
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-200">
              <Sparkles className="size-3.5" aria-hidden />
              {tryOn.guide.eyebrow}
            </p>
            <DialogPrimitive.Title className="mt-2 pe-8 font-display text-2xl font-semibold leading-tight text-gold-100 sm:text-[1.7rem]">{t.title}</DialogPrimitive.Title>
            <p className="mt-1.5 text-sm text-white/75">{t.body}</p>
            <DialogPrimitive.Close
              aria-label={common.close}
              className="absolute end-3 top-3 inline-flex size-10 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="grid grid-cols-2 gap-3 p-5 sm:gap-4 sm:p-6">
            {/* Original, as photographed */}
            <button type="button" onClick={() => onPick('ORIGINAL')} className={cn(card, 'border-border')}>
              <span className="block p-2">
                <span className={frame}>
                  {originalImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the design's own public web preview
                    <img src={originalImageUrl} alt="" className="size-full object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <ImageIcon className="absolute inset-0 m-auto size-6 text-muted" aria-hidden />
                  )}
                </span>
              </span>
              <span className="block px-3 pb-4 pt-1">
                <span className="block font-display text-lg font-semibold leading-tight text-accent-950">{t.original}</span>
                <span className="mt-0.5 block text-xs text-muted">{t.originalHint}</span>
              </span>
            </button>

            {/* Her customised version */}
            <button type="button" disabled={!complete} onClick={() => onPick('CUSTOM')} className={cn(card, 'border-gold-300 ring-1 ring-gold-200')}>
              <span className="block p-2">
                <span className={frame}>
                  {customImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- her own preview, a short-lived signed link
                    <img src={customImageUrl} alt="" draggable={false} className="pointer-events-none size-full select-none object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(80%_80%_at_50%_40%,#f5e2a8_0%,#ebd59c_40%,#d9c3a2_100%)] text-accent-900">
                      <Sparkles className="size-7" aria-hidden />
                    </span>
                  )}
                  <span className="absolute end-2 top-[18%] inline-flex items-center gap-1 rounded-full bg-accent-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-100">
                    <Sparkles className="size-3" aria-hidden />
                    {tryOn.versionCustom}
                  </span>
                </span>
              </span>
              <span className="block px-3 pb-4 pt-1">
                <span className="block font-display text-lg font-semibold leading-tight text-accent-950">{t.custom}</span>
                <span className="mt-0.5 block text-xs text-muted">{t.customHint}</span>
                {changes.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {changes.slice(0, 4).map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-2 py-0.5 text-[11px] text-accent-900 ring-1 ring-gold-200">
                        <Check className="size-3 text-gold-600" aria-hidden />
                        {c}
                      </span>
                    ))}
                    {changes.length > 4 && <span className="text-[11px] text-muted">+{changes.length - 4}</span>}
                  </span>
                )}
              </span>
            </button>
          </div>
          <p className="-mt-2 px-6 pb-6 text-center text-xs text-muted">{!complete ? t.incomplete : customImageUrl ? '' : t.customMakeFirst}</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
