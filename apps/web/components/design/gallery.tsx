'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, ShieldCheck, X, ZoomIn } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStrings } from '@/components/i18n/locale-provider';
import { FlyImage } from '@/components/motion/fly-image';
import { cn } from '@/lib/utils';
import { useColourChoice } from './colour-choice';
import { DesignImage } from './design-image';

type Shot = { url: string; alt: string | null; colourId: string | null };
type Colour = { id: string; name: string; isDefault: boolean };

/**
 * The design's photoshoot, following the colour picked in the redesign panel: the photos
 * tagged with that colour when there are any, otherwise the main photoshoot with a note
 * saying which colour it shows. Nothing is generated: every photo is a real design image.
 */
export function Gallery({ images, name, colours = [] }: { images: Shot[]; name: string; colours?: Colour[] }) {
  const { design: t } = useStrings();
  const { colourId } = useColourChoice();
  const chosen = colourId ? (colours.find((c) => c.id === colourId) ?? null) : null;
  const ofColour = chosen ? images.filter((i) => i.colourId === chosen.id) : [];
  const main = images.filter((i) => !i.colourId);
  const shots = ofColour.length > 0 ? ofColour : main.length > 0 ? main : images;

  // The main photoshoot is taken to show the design's default colour.
  const defaultColour = colours.find((c) => c.isDefault) ?? null;
  let note: string | null = null;
  if (chosen && ofColour.length === 0) {
    if (!defaultColour) note = t.noPhotosIn(chosen.name);
    else if (defaultColour.id !== chosen.id) note = t.shownIn(defaultColour.name);
  }

  // A different set of photos starts again from its first one (and fades in).
  return <Shots key={ofColour.length > 0 ? chosen!.id : 'main'} list={shots} name={name} note={note} />;
}

/** A swipeable main image with thumbnails (each angle's caption on hover) and a full-screen viewer. */
function Shots({ list: shots, name, note }: { list: Shot[]; name: string; note: string | null }) {
  const { design: t } = useStrings();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const list: Shot[] = shots.length > 0 ? shots : [{ url: '', alt: name, colourId: null }];

  const goTo = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    // Right-to-left pages scroll towards negative scrollLeft.
    const flow = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    el.scrollTo({ left: flow * i * el.clientWidth, behavior: 'smooth' });
    setActive(i);
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <section
      aria-label={t.gallery}
      aria-roledescription="carousel"
      className={cn('lg:sticky lg:top-24 lg:self-start', list.length > 1 && 'lg:grid lg:grid-cols-[5.25rem_minmax(0,1fr)] lg:gap-4')}
    >
      <div className="min-w-0">
        <div className="group/frame relative motion-safe:animate-fade-in">
          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              // scrollLeft is negative in right-to-left pages.
              setActive(Math.round(Math.abs(el.scrollLeft) / Math.max(el.clientWidth, 1)));
            }}
            className="-mx-4 flex snap-x snap-mandatory overflow-x-auto scrollbar-none sm:mx-0 sm:rounded-[1.4rem] sm:shadow-[0_40px_80px_-50px_rgba(107,31,42,0.55),0_18px_40px_-30px_rgba(35,28,23,0.35)] sm:ring-1 sm:ring-gold-200/70"
          >
            {list.map((img, i) => (
              <div
                key={`${img.url}-${i}`}
                className="w-full shrink-0 snap-center"
                role="group"
                aria-roledescription="slide"
                aria-label={t.imageOf(i + 1, list.length)}
              >
                <button
                  id={i === 0 ? 'gallery-first-frame' : undefined}
                  type="button"
                  onClick={() => img.url && setOpen(i)}
                  aria-label={t.zoom}
                  className="group relative block w-full cursor-zoom-in focus-visible:outline-none"
                >
                  <DesignImage
                    src={img.url || null}
                    alt={img.alt ?? name}
                    name={name}
                    priority={i === 0}
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="aspect-[4/5] bg-[radial-gradient(120%_80%_at_50%_0%,#FFFCF6_0%,#F5EBDA_55%,#EADBC2_100%)]"
                    fit="contain"
                  />
                  {img.url && (
                    <span className="pointer-events-none absolute bottom-4 start-4 hidden items-center gap-1.5 rounded-full bg-surface/85 px-3 py-1.5 text-xs font-medium text-accent-900 opacity-0 shadow-sm backdrop-blur transition-opacity duration-300 group-hover:opacity-100 sm:flex">
                      <ZoomIn className="size-3.5" aria-hidden />
                      {t.zoomHint}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
          {/* A thin inner hairline, like a mount around a print */}
          <span aria-hidden className="pointer-events-none absolute inset-3 hidden rounded-[1rem] ring-1 ring-inset ring-white/45 sm:block" />

          {list.length > 1 && (
            <>
              <p
                dir="ltr"
                className="absolute bottom-4 end-4 rounded-full bg-neutral-950/55 px-3 py-1 font-display text-xs tabular-nums tracking-[0.2em] text-white backdrop-blur"
                aria-hidden
              >
                {pad(active + 1)} <span className="text-white/60">/ {pad(list.length)}</span>
              </p>
              <button
                type="button"
                onClick={() => goTo((active - 1 + list.length) % list.length)}
                aria-label={t.prevImage}
                className="absolute start-4 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-accent-900 opacity-0 shadow-md backdrop-blur transition-opacity duration-300 hover:bg-surface focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 group-hover/frame:opacity-100 lg:flex"
              >
                <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => goTo((active + 1) % list.length)}
                aria-label={t.nextImage}
                className="absolute end-4 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-accent-900 opacity-0 shadow-md backdrop-blur transition-opacity duration-300 hover:bg-surface focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 group-hover/frame:opacity-100 lg:flex"
              >
                <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
              </button>
            </>
          )}
        </div>

        {note && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted" aria-live="polite">
            <span aria-hidden className="h-px w-5 bg-gold-300" />
            {note}
          </p>
        )}
      </div>

      {list.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none lg:order-first lg:mt-0 lg:max-h-[calc(100vh-8rem)] lg:flex-col lg:gap-3 lg:overflow-y-auto lg:overflow-x-visible lg:p-1">
          {list.map((img, i) => (
            <button
              key={`thumb-${img.url}-${i}`}
              type="button"
              onClick={() => goTo(i)}
              aria-label={img.alt ? `${t.showImage(i + 1)}: ${img.alt}` : t.showImage(i + 1)}
              title={img.alt ?? undefined}
              aria-current={active === i}
              className={cn(
                'relative w-16 shrink-0 overflow-hidden rounded-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:w-20 lg:w-full',
                active === i
                  ? 'ring-2 ring-gold-400 ring-offset-2 ring-offset-background'
                  : 'opacity-55 ring-1 ring-gold-200/70 hover:opacity-100',
              )}
            >
              <DesignImage src={img.url || null} alt="" name={name} sizes="84px" className="aspect-[4/5]" />
            </button>
          ))}
        </div>
      )}

      <p className={cn('mt-3 flex items-center gap-1.5 text-[11px] leading-snug text-muted', list.length > 1 && 'lg:col-start-2')}>
        <ShieldCheck className="size-3.5 shrink-0 text-gold-500" aria-hidden />
        {t.imageRights}
      </p>

      {/* The photo from the product card flies into this frame when the page opens. */}
      <FlyImage src={list[0]?.url || null} targetId="gallery-first-frame" />
      {open !== null && <Lightbox images={list} name={name} start={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Full-screen viewer: arrows and keys to move between shots, click or tap to zoom 2×. */
export function Lightbox({
  images,
  name,
  start,
  onClose,
  initialZoom = null,
}: {
  images: Shot[];
  name: string;
  start: number;
  onClose: () => void;
  /** Open already zoomed in on this point (percentages), e.g. a fabric detail. */
  initialZoom?: { x: number; y: number } | null;
}) {
  const { design: t } = useStrings();
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(initialZoom);
  const count = images.length;
  const image = images[index] ?? images[0]!;

  const step = useCallback(
    (by: number) => {
      setZoom(null);
      setIndex((i) => (i + by + count) % count);
    },
    [count],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-neutral-950/92 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col focus-visible:outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{name}</DialogPrimitive.Title>
          <div className="flex items-center justify-between px-4 py-3 text-white/80">
            <p className="text-xs font-medium uppercase tracking-[0.2em]">
              {t.imageOf(index + 1, count)}
              {image.alt && image.alt !== name ? <span className="ms-3 normal-case tracking-normal text-white/60">{image.alt}</span> : null}
            </p>
            <DialogPrimitive.Close
              className="inline-flex size-11 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={t.closeZoom}
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="relative flex-1 overflow-hidden">
            <button
              type="button"
              aria-label={zoom ? t.closeZoom : t.zoom}
              onClick={(e) => {
                if (zoom) return setZoom(null);
                const r = e.currentTarget.getBoundingClientRect();
                setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
              }}
              className={cn('absolute inset-0 focus-visible:outline-none', zoom ? 'cursor-zoom-out' : 'cursor-zoom-in')}
            >
              <Image
                key={image.url}
                src={image.url}
                alt={image.alt ?? name}
                fill
                sizes="100vw"
                priority
                draggable={false}
                className="object-contain transition-transform duration-500 ease-out motion-safe:animate-fade-in"
                style={zoom ? { transform: 'scale(2.2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              />
            </button>
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label={t.prevImage}
                  className="absolute start-3 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ChevronLeft className="size-6 rtl:-scale-x-100" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label={t.nextImage}
                  className="absolute end-3 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ChevronRight className="size-6 rtl:-scale-x-100" aria-hidden />
                </button>
              </>
            )}
          </div>

          {count > 1 && (
            <div className="flex justify-center gap-2 px-4 py-4">
              {images.map((img, i) => (
                <button
                  key={`${img.url}-${i}`}
                  type="button"
                  onClick={() => {
                    setZoom(null);
                    setIndex(i);
                  }}
                  aria-label={t.showImage(i + 1)}
                  aria-current={i === index}
                  className={cn(
                    'relative h-16 w-12 overflow-hidden rounded-md border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                    i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-90',
                  )}
                >
                  <Image src={img.url} alt="" fill sizes="48px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
