'use client';

import type { MyAiPictureDto } from '@abaya/contracts';
import { ArrowUpRight, Camera, Clock, Loader2, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Alert, Skeleton } from '@/components/ui/misc';
import { errorMessage } from '@/lib/api-client';
import { useDeleteTryOn, useMyAiPictures } from '@/lib/queries/try-on';
import { cn } from '@/lib/utils';

/** Each picture is hers for this long after she got it (the bar shows how much is left). */
const KEEP_MS = 60 * 60_000;
/** The countdown turns red in the last minutes. */
const SOON_MS = 10 * 60_000;

/** The time now, every `everyMs` (countdowns). */
function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** A picture that cannot be saved: no right-click, no dragging, no long-press (it is also watermarked). */
function ProtectedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <span className={cn('relative block select-none [-webkit-touch-callout:none]', className)} onContextMenu={(e) => e.preventDefault()}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to her own picture */}
      <img src={src} alt={alt} draggable={false} className="pointer-events-none size-full object-cover" />
      <span aria-hidden className="absolute inset-0" />
    </span>
  );
}

/**
 * "My AI pictures" on her profile: every preview and try-on she can still see, from every abaya,
 * with how long ago it was made and a live countdown to when it is deleted. Tap to see it large;
 * pictures being made show progress and appear when ready; expired ones drop off by themselves.
 */
export function MyAiPictures() {
  const { account, tryOn } = useStrings();
  const t = account.aiPictures;
  const pictures = useMyAiPictures();
  const now = useNow(15_000);
  const [open, setOpen] = useState<MyAiPictureDto | null>(null);

  if (pictures.isPending) return <Skeleton className="h-48" />;
  if (pictures.isError) return <Alert tone="danger">{errorMessage(pictures.error)}</Alert>;
  const items = pictures.data.items.filter((p) => !p.expiresAt || Date.parse(p.expiresAt) > now);
  if (items.length === 0)
    return (
      <p className="flex items-center gap-3 rounded-xl border border-dashed border-gold-300/80 bg-sand-50/70 px-4 py-4 text-sm text-neutral-700">
        <Sparkles className="size-4 shrink-0 text-gold-500" aria-hidden />
        <span>
          {t.empty}{' '}
          <Link href="/abayas" className="font-medium text-accent-800 underline underline-offset-4">
            {t.browse}
          </Link>
        </span>
      </p>
    );

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => {
          const left = p.expiresAt ? Math.max(0, Date.parse(p.expiresAt) - now) : KEEP_MS;
          const minutesLeft = Math.ceil(left / 60_000);
          const soon = left <= SOON_MS;
          const madeAgo = Math.max(0, Math.floor((now - Date.parse(p.createdAt)) / 60_000));
          const making = p.status === 'QUEUED' || p.status === 'RUNNING';
          const name = p.design?.name ?? t.unavailable;
          return (
            <li key={p.id} className="group">
              <button
                type="button"
                disabled={p.status !== 'DONE' || !p.imageUrl}
                onClick={() => setOpen(p)}
                aria-label={t.open(name)}
                className="relative block w-full overflow-hidden rounded-xl bg-sand-100 ring-1 ring-gold-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-default"
              >
                {p.status === 'DONE' && p.imageUrl ? (
                  <ProtectedImage src={p.imageUrl} alt="" className="aspect-[3/4] transition-transform duration-700 group-hover:scale-[1.03]" />
                ) : (
                  <span className="relative flex aspect-[3/4] flex-col items-center justify-center gap-2 overflow-hidden px-3 text-center text-xs text-neutral-700">
                    {making ? (
                      <>
                        <span aria-hidden className="absolute -inset-x-1/2 inset-y-0 bg-gradient-to-r from-transparent via-white/70 to-transparent motion-safe:animate-shimmer" />
                        <Loader2 className="relative size-5 animate-spin text-accent-700" aria-hidden />
                        <span className="relative">{t.beingMade}</span>
                      </>
                    ) : (
                      <>
                        <TriangleAlert className="size-5 text-warning" aria-hidden />
                        {t.failed}
                      </>
                    )}
                  </span>
                )}
                <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-neutral-950/70 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
                  {p.kind === 'TRYON' ? <Camera className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
                  {p.kind === 'TRYON' ? `${t.tryOn} · ${p.customised ? tryOn.versionCustom : tryOn.versionOriginal}` : t.preview}
                </span>
              </button>

              <p className="mt-2.5 line-clamp-1 font-display text-lg font-semibold leading-snug">
                {p.design ? (
                  <Link href={`/abayas/${p.design.slug}`} className="hover:text-accent-800">
                    {p.design.name}
                  </Link>
                ) : (
                  <span className="text-muted">{t.unavailable}</span>
                )}
              </p>
              <p className="text-xs text-muted">{t.madeAgo(madeAgo)}</p>
              <div className="mt-2" title={t.timeLeft}>
                <p className={cn('flex items-center gap-1.5 text-xs font-medium tabular-nums', soon ? 'text-danger' : 'text-accent-900')}>
                  <Clock className="size-3.5" aria-hidden />
                  {t.deletedIn(minutesLeft)}
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand-200" aria-hidden>
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-700', soon ? 'bg-danger' : 'bg-gradient-to-r from-accent-800 to-gold-400')}
                    style={{ width: `${Math.min(100, (left / KEEP_MS) * 100)}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {open && <PictureViewer picture={open} now={now} onClose={() => setOpen(null)} />}
    </>
  );
}

function PictureViewer({ picture, now, onClose }: { picture: MyAiPictureDto; now: number; onClose: () => void }) {
  const { account } = useStrings();
  const t = account.aiPictures;
  const remove = useDeleteTryOn();
  const left = picture.expiresAt ? Math.max(0, Date.parse(picture.expiresAt) - now) : KEEP_MS;
  const name = picture.design?.name ?? t.unavailable;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogTitle className="font-display text-2xl font-semibold">{name}</DialogTitle>
        <DialogDescription className={cn('flex items-center gap-1.5 text-sm', left <= SOON_MS ? 'text-danger' : 'text-neutral-700')}>
          <Clock className="size-4" aria-hidden />
          {t.deletedIn(Math.ceil(left / 60_000))}
        </DialogDescription>
        <figure className="mt-4 overflow-hidden rounded-xl border border-border">
          {picture.imageUrl && <ProtectedImage src={picture.imageUrl} alt={name} className="aspect-[3/4]" />}
          <figcaption className="p-3 text-xs text-muted">{t.noSave}</figcaption>
        </figure>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button
            variant="dangerOutline"
            size="sm"
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(picture.id, {
                onSuccess: () => {
                  toast.success(t.deleted);
                  onClose();
                },
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            <Trash2 aria-hidden />
            {t.deleteNow}
          </Button>
          {picture.design && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/abayas/${picture.design.slug}`}>
                {t.viewAbaya}
                <ArrowUpRight className="rtl:-scale-x-100" aria-hidden />
              </Link>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
