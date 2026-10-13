'use client';

import {type DesignDetail } from '@abaya/contracts';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useStrings } from '@/components/i18n/locale-provider';
import { Link } from '@/components/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';
import { useDesign } from '@/lib/queries/catalog';
import { cn } from '@/lib/utils';
import { DesignImage } from './design-image';
import { WishlistButton } from './wishlist-button';
import { useMoney } from '@/lib/currency';

const MAX_SHOTS = 6;

/**
 * Quick view: the design's photos, price, colours and a short description in a dialog, without
 * leaving the grid. Colour dots switch to that colour's photos (as on the design page). The only
 * way to order is "Customize this abaya", which opens the full page with the redesign panel.
 */
export function QuickView({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { home } = useStrings();
  const design = useDesign(slug);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-4xl sm:overflow-hidden">
        {design.data ? (
          <Loaded design={design.data} />
        ) : (
          <div className="grid sm:grid-cols-[1.05fr_1fr]">
            <DialogTitle className="sr-only">{home.quickView}</DialogTitle>
            <div className="bg-sand-100 p-6">
              <Skeleton className="aspect-[3/4] rounded-b-2xl rounded-t-full" />
            </div>
            <div className="space-y-4 p-8" aria-busy={!design.isError}>
              {design.isError ? (
                <p className="text-sm text-muted">{home.quickViewError}</p>
              ) : (
                <>
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-5 w-1/4" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-11 rounded-full" />
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Loaded({ design }: { design: DesignDetail }) {
  const money = useMoney();
  const { home, common, styles } = useStrings();
  const colours = design.optionGroups.find((g) => g.code === 'COLOUR')?.values.filter((v) => v.colourHex) ?? [];
  const [colourId, setColourId] = useState<string | null>(null);
  const [shot, setShot] = useState(0);
  // A colour with its own photos shows those; otherwise the main photoshoot (as in the gallery).
  const ofColour = colourId ? design.images.filter((i) => i.colourId === colourId) : [];
  const main = design.images.filter((i) => !i.colourId);
  const list = (ofColour.length > 0 ? ofColour : main.length > 0 ? main : design.images).slice(0, MAX_SHOTS);
  const current = list[Math.min(shot, Math.max(list.length - 1, 0))] ?? null;
  const chosen = colours.find((c) => c.id === colourId) ?? null;
  const eyebrow = design.collectionName ? home.collectionTag(design.collectionName) : styles[design.style];

  return (
    <div className="grid sm:grid-cols-[1.05fr_1fr]">
      {/* Photos */}
      <div className="relative bg-sand-100 p-4 pt-14 sm:p-6">
        <div className="relative overflow-hidden rounded-b-2xl rounded-t-full bg-sand-200">
          <span aria-hidden className="pointer-events-none absolute inset-2 z-10 rounded-b-xl rounded-t-full border border-gold-300/60" />
          <DesignImage
            key={current?.url ?? 'none'}
            src={current?.url}
            alt={current?.alt ?? design.name}
            name={design.name}
            sizes="(min-width: 640px) 440px, 100vw"
            className="aspect-[3/4] motion-safe:animate-fade-in"
            imagePosition="50% 15%"
          />
        </div>
        {list.length > 1 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {list.map((p, i) => (
              <button
                key={p.url}
                type="button"
                onClick={() => setShot(i)}
                aria-label={`${i + 1} / ${list.length}`}
                aria-pressed={i === shot}
                className={cn(
                  'size-12 overflow-hidden rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                  i === shot ? 'border-gold-500' : 'border-transparent hover:border-gold-300',
                )}
              >
                <DesignImage src={p.url} alt="" name={design.name} sizes="48px" className="size-full" imagePosition="50% 15%" />
              </button>
            ))}
          </div>
        )}
        {design.isNew && (
          <span className="absolute start-5 top-[18%] z-20 rounded-full bg-accent-900 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white shadow-md sm:start-7">
            {home.newArrival}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-col p-6 sm:justify-center sm:p-8 sm:pe-14">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-600">
          <span className="size-1.5 rounded-full bg-gold-500" aria-hidden />
          {eyebrow}
        </p>
        <DialogTitle className="mt-2 text-3xl font-normal leading-tight">{design.name}</DialogTitle>
        <p className="mt-2 text-lg text-neutral-800">
          <span className="text-sm text-muted">{common.from} </span>
          <span className="font-medium">{money(design.fromPriceInPaise)}</span>
        </p>
        {design.description ? <DialogDescription className="line-clamp-4 leading-relaxed">{design.description}</DialogDescription> : null}

        {colours.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-700">
              {home.quickColour}
              {chosen ? <span className="normal-case tracking-normal text-muted">: {chosen.name}</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {colours.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setColourId(colourId === c.id ? null : c.id);
                    setShot(0);
                  }}
                  aria-label={c.name}
                  aria-pressed={colourId === c.id}
                  title={c.name}
                  className={cn(
                    'size-7 rounded-full border border-black/10 shadow-[inset_0_0_0_2px_#FFFCF6] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
                    colourId === c.id && 'ring-2 ring-accent-700 ring-offset-2 ring-offset-surface',
                  )}
                  style={{ backgroundColor: c.colourHex ?? undefined }}
                />
              ))}
            </div>
          </div>
        )}

        <p className="mt-5 flex items-center gap-2 text-sm text-neutral-700">
          <span className="size-1.5 rounded-full bg-accent-500" aria-hidden />
          {home.madeToOrder(design.leadTimeDays)}
        </p>

        <div className="mt-8 flex items-center gap-3">
          <Button asChild size="lg" className="flex-1">
            <Link href={`/abayas/${design.slug}`}>
              {home.customise}
              <ArrowRight className="rtl:-scale-x-100" aria-hidden />
            </Link>
          </Button>
          <WishlistButton designId={design.id} />
        </div>
      </div>
    </div>
  );
}
