import type { AbayaStyle, DesignCard } from '@abaya/contracts';
import { ArrowRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { DesignImage } from '@/components/design/design-image';
import { Link } from '@/components/i18n/navigation';
import { MaskedText } from '@/components/motion/masked-text';
import { ArabesqueBorder, EyebrowStar, MashrabiyaPattern } from '@/components/ornament/geometric';
import { dictionaryFor, type Locale } from '@/content/i18n';
import { SilhouetteSketch } from './silhouette-sketch';

const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;

/** Per style: the newest design with a real photo (null when none yet) and how many designs there are. */
export type SilhouetteShot = { style: AbayaStyle; design: DesignCard | null; count: number };

/**
 * Explore silhouettes: a gallery of tall arched tiles, one per style. Each shows a real design
 * photo of that style when one exists; otherwise a gold line drawing of the cut draws itself on
 * as the row scrolls in (components/home/silhouette-sketch.tsx). The name, a line and the number
 * of designs sit on a burgundy fade at the foot; hover lifts the tile and slides out the arrow.
 * On phones the tiles are a horizontal strip with snap.
 */
export function Silhouettes({ locale, shots }: { locale: Locale; shots: SilhouetteShot[] }) {
  const { home } = dictionaryFor(locale);
  const tiles = home.silhouettes.map((t) => {
    const shot = shots.find((s) => s.style === t.style);
    return { ...t, design: shot?.design ?? null, count: shot?.count ?? 0 };
  });
  if (tiles.every((t) => t.count === 0)) return null;

  return (
    <div className="relative">
      <ArabesqueBorder className="mb-12 text-gold-400/70 sm:mb-16" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-16" aria-hidden>
        <MashrabiyaPattern size={64} className="text-accent-700/[0.05] [mask-image:radial-gradient(ellipse_70%_80%_at_70%_50%,black,transparent_85%)]" />
      </div>
      <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] lg:gap-14">
        <div data-reveal className="max-w-sm lg:pt-6">
          <p className="mb-3 flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.28em] text-accent-700">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold-400 rtl:bg-gradient-to-l" aria-hidden />
            <EyebrowStar />
            {home.silhouettesEyebrow}
          </p>
          <h2 className="font-display text-4xl leading-[1.05] text-foreground sm:text-5xl">
            <MaskedText text={home.silhouettesTitle} />
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-600">{home.silhouettesBody}</p>
        </div>

        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:gap-6">
          {tiles.map((t, i) => (
            <li key={t.style} data-reveal={t.design ? 'tile' : 'sketch'} style={delay(i * 140)} className="w-[72vw] shrink-0 snap-center sm:w-auto">
              <Link
                href={`/abayas?style=${t.style}`}
                className="group relative block aspect-[3/4] overflow-hidden rounded-b-[1.5rem] rounded-t-full bg-accent-900 shadow-[0_1px_0_rgba(68,17,27,0.06)] transition-[transform,box-shadow] duration-500 hover:-translate-y-1.5 hover:shadow-[0_0_0_1px_rgba(204,162,74,0.5),0_40px_70px_-30px_rgba(68,17,27,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-4 motion-reduce:hover:translate-y-0"
              >
                {t.design ? (
                  <DesignImage
                    src={t.design.primaryImageUrl}
                    alt=""
                    name={t.title}
                    sizes="(min-width: 1024px) 24vw, (min-width: 640px) 33vw, 72vw"
                    className="absolute inset-0 [&_img]:transition-transform [&_img]:duration-[1600ms] [&_img]:ease-out group-hover:[&_img]:scale-[1.06]"
                    imagePosition="50% 12%"
                  />
                ) : (
                  // No real photo of this cut yet: a gold line drawing of it, on burgundy
                  <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-b from-accent-800 to-accent-950 pb-[26%] pt-[14%] text-gold-300">
                    <MashrabiyaPattern size={48} className="text-gold-200/10" />
                    <SilhouetteSketch style={t.style} className="relative transition-transform duration-[1600ms] ease-out group-hover:scale-[1.04]" />
                  </div>
                )}
                {/* The brand's thin gold arch inside the frame */}
                <span aria-hidden className="pointer-events-none absolute inset-x-[7%] bottom-0 top-[6%] rounded-t-full border border-gold-300/50" />
                {/* Burgundy foot for the words */}
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-accent-950 via-accent-950/70 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 text-white sm:p-6">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-gold-200">{home.designsCount(t.count)}</p>
                    <h3 className="mt-1.5 font-display text-2xl leading-tight sm:text-[1.7rem]">{t.title}</h3>
                    <p className="mt-1 text-xs text-white/75">{t.body}</p>
                  </div>
                  <span className="mb-1 inline-flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-full border border-gold-300/70 bg-white/10 ps-2.5 pe-2.5 text-xs font-medium text-gold-100 backdrop-blur transition-[padding,background-color] duration-500 group-hover:bg-gold-300 group-hover:pe-4 group-hover:text-accent-950">
                    <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-500 group-hover:max-w-[6rem] group-hover:opacity-100">{home.silhouettesExplore}</span>
                    <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
