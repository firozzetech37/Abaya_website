'use client';

import type { DesignCard } from '@abaya/contracts';
import { m, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { type CSSProperties, type ReactNode, useRef } from 'react';
import { DesignImage } from '@/components/design/design-image';
import { useStrings } from '@/components/i18n/locale-provider';
import { Link } from '@/components/i18n/navigation';
import { MaskedText } from '@/components/motion/masked-text';
import { ArabesqueBorder, EyebrowStar, MashrabiyaPattern } from '@/components/ornament/geometric';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;

/**
 * Where each close-up looks on a full-length photo when no detail shot is tagged: deep crops, so
 * texture and thread show rather than a person. Fabric at the skirt, embroidery and sleeves at
 * the arms, closure at the chest, finishing at the hem, fit at the waist.
 */
const CROPS = [
  { position: '50% 72%', scale: 2.6 },
  { position: '28% 46%', scale: 3.4 },
  { position: '78% 42%', scale: 3.2 },
  { position: '50% 36%', scale: 3 },
  { position: '50% 96%', scale: 3.4 },
  { position: '50% 54%', scale: 2.8 },
];

/** The bento (4 columns): a tall tile and a wide one, two squares beside the tall one, two wide ones below. */
const SPANS = ['lg:col-span-2 lg:row-span-2', 'lg:col-span-2', '', '', 'lg:col-span-2', 'lg:col-span-2'];

/**
 * Craftsmanship: six details a customer chooses on the design page and the atelier makes by hand,
 * each a close-up. The picture is a detail shot tagged in the admin (`DesignCard.detailImageUrls`)
 * when the designs have any; otherwise a deep CSS crop of a real design photo (never an invented
 * image). Tiles sit in a bento of mixed sizes, reveal in sequence, tilt gently towards the mouse and,
 * on hover, the crop glides like a macro lens while the options each detail offers slide up.
 */
export function Craftsmanship({ designs }: { designs: DesignCard[] }) {
  const { home } = useStrings();
  // Real photoshoots only: the seed's drawings have no fabric or thread to show.
  const photos = designs.filter((d) => d.primaryImageUrl && !d.primaryImageUrl.includes('/seed/'));
  // `?? []` so the home page survives an API that predates detail shots (a stale dev server, a rollout).
  const details = designs.flatMap((d) => (d.detailImageUrls ?? []).map((url) => ({ url, name: d.name })));
  if (photos.length === 0) return null;

  return (
    <section className="relative overflow-hidden bg-sand-50 py-20 sm:py-24">
      <MashrabiyaPattern size={72} className="text-accent-700/[0.045] [mask-image:radial-gradient(ellipse_60%_70%_at_20%_40%,black,transparent_85%)]" />
      <div className="container relative">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div data-reveal className="max-w-2xl">
            <p className="flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.28em] text-accent-700">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold-400 rtl:bg-gradient-to-l" aria-hidden />
              <EyebrowStar />
              {home.craftEyebrow}
            </p>
            <h2 className="mt-3 font-display text-4xl leading-[1.05] sm:text-5xl lg:text-[3.6rem]">
              <MaskedText text={home.craftTitle} />
            </h2>
            <p className="mt-4 max-w-xl text-neutral-600">{home.craftBody}</p>
          </div>
          <div data-reveal style={delay(200)}>
            <Button asChild size="lg" variant="gold" className="rounded-full">
              <Link href="/abayas">
                {home.craftCta}
                <ArrowRight className="rtl:-scale-x-100" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        <ArabesqueBorder className="mt-10 text-gold-400/60" />

        <ul className="mt-10 grid auto-rows-[minmax(0,1fr)] grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:[grid-auto-rows:16rem] xl:[grid-auto-rows:18rem]">
          {home.craft.map((item, i) => {
            const detail = details[i % Math.max(details.length, 1)];
            const photo = photos[i % photos.length]!;
            const crop = CROPS[i % CROPS.length]!;
            return (
              <li key={item.title} data-reveal style={delay(i * 110)} className={cn('min-h-[17rem] sm:min-h-[15rem]', SPANS[i])}>
                <Tile index={i} item={item} span={SPANS[i] ?? ''}>
                  {details.length > 0 && detail ? (
                    <DesignImage
                      src={detail.url}
                      alt={`${item.title}: ${detail.name}`}
                      name={detail.name}
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="absolute inset-0 [&_img]:transition-transform [&_img]:duration-[2400ms] [&_img]:ease-out group-hover:[&_img]:scale-[1.08]"
                    />
                  ) : (
                    <DesignImage
                      src={photo.primaryImageUrl}
                      alt={`${item.title}: ${photo.name}`}
                      name={photo.name}
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="absolute inset-0 [&_img]:transition-[transform,object-position] [&_img]:duration-[2400ms] [&_img]:ease-out"
                      imagePosition={crop.position}
                    />
                  )}
                  {/* The macro lens: the crop is zoomed by scaling the frame's image, and glides on hover */}
                  {!(details.length > 0 && detail) && (
                    <style>{`[data-craft="${i}"] img{transform:scale(${crop.scale})}[data-craft="${i}"]:hover img{transform:scale(${crop.scale * 1.08}) translate(-2%,2%)}`}</style>
                  )}
                </Tile>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Tile({ index, item, span, children }: { index: number; item: { title: string; body: string; options: string }; span: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const big = span.includes('row-span-2');
  return (
    <m.div
      className="h-full"
      whileHover={reduced ? undefined : { y: -6 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      <Link
        ref={ref}
        href="/abayas"
        data-craft={index}
        className="group relative block h-full overflow-hidden rounded-[1.25rem] bg-accent-950 shadow-[0_1px_0_rgba(68,17,27,0.06)] transition-shadow duration-500 hover:shadow-[0_0_0_1px_rgba(204,162,74,0.55),0_40px_70px_-30px_rgba(68,17,27,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-4"
      >
        {children}
        {/* A gold hairline frame that draws in on hover, and the burgundy foot for the words */}
        <span aria-hidden className="pointer-events-none absolute inset-2.5 rounded-[0.9rem] border border-gold-200/0 transition-colors duration-700 group-hover:border-gold-200/70" />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-[1200ms] ease-out group-hover:translate-x-[200%] rtl:group-hover:-translate-x-[200%]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-accent-950/95 via-accent-950/50 to-transparent" />

        <span className="absolute start-4 top-4 font-display text-3xl leading-none text-gold-200/90 [text-shadow:0_2px_12px_rgba(0,0,0,0.4)] sm:start-5 sm:top-5">
          {String(index + 1).padStart(2, '0')}
        </span>

        <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
          <h3 className={cn('font-display leading-tight', big ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-2xl sm:text-[1.65rem]')}>{item.title}</h3>
          <p className={cn('mt-1 text-white/80', big ? 'text-xs sm:text-sm lg:text-base' : 'text-xs sm:text-sm')}>{item.body}</p>
          {/* The options this detail offers slide up on hover (always shown on touch screens) */}
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gold-200 transition-all duration-500 [@media(hover:hover)]:max-h-0 [@media(hover:hover)]:translate-y-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:max-h-10 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100">
            {item.options}
          </p>
        </div>
      </Link>
    </m.div>
  );
}
