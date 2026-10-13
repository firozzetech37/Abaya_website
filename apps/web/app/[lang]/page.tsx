import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ArrowRight, Camera, RefreshCcw, Ruler } from 'lucide-react';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { Link } from '@/components/i18n/navigation';
import { DesignCard, DesignGrid } from '@/components/design/design-card';
import { DesignImage } from '@/components/design/design-image';
import { CollectionReel } from '@/components/home/collection-reel';
import { Craftsmanship } from '@/components/home/craftsmanship';
import { HeroHeadline } from '@/components/home/hero-headline';
import { HeroShowcase } from '@/components/home/hero-showcase';
import { Journey } from '@/components/home/journey';
import { Silhouettes } from '@/components/home/silhouettes';
import { ThreeSteps } from '@/components/home/three-steps';
import { CountUp } from '@/components/motion/count-up';
import { MaskedText } from '@/components/motion/masked-text';
import { ParallaxPattern } from '@/components/motion/parallax-pattern';
import { ArabesqueBorder, EyebrowStar, Lantern, MashrabiyaPattern, StarDivider } from '@/components/ornament/geometric';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { stringsFor } from '@/content/i18n';
import { getCollections, getDesigns } from '@/lib/server-api';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { brand, home } = (await stringsFor(params)).strings;
  return {
    title: { absolute: home.metaTitle },
    description: brand.description,
    openGraph: { title: home.metaTitle, description: brand.description },
  };
}

/** The journey's step pictures: `public/journey/<nn>-<name>.jpg|webp` when the atelier has added them (see the README there). */
const JOURNEY_FILES = ['01-sketch', '02-fabric', '03-pattern', '04-cutting', '05-stitching', '06-quality', '07-delivered'];
function journeyImages(): (string | null)[] {
  return JOURNEY_FILES.map((name) => {
    for (const ext of ['jpg', 'jpeg', 'webp', 'png']) {
      if (existsSync(join(process.cwd(), 'public', 'journey', `${name}.${ext}`))) return `/journey/${name}.${ext}`;
    }
    return null;
  });
}

/** How many of the newest designs the hero looks through for photos large enough to show sharp. */
const HERO_POOL = 30;

/** Stagger for sibling `data-reveal` elements. */
const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;
/** Staggered entrance for hero text on first paint. */
const enter = (ms: number) => ({ animationDelay: `${ms}ms` });

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { locale, strings } = await stringsFor(params);
  const { home } = strings;
  const silhouetteStyles = home.silhouettes.map((s) => s.style);
  const [designs, heroPool, collections, styleShots] = await Promise.all([
    getDesigns({ limit: 8, sort: 'newest' }, locale),
    // The hero needs large photos: it picks the newest few that are sharp enough from a wider pool.
    getDesigns({ limit: HERO_POOL, sort: 'newest' }, locale),
    getCollections(locale),
    Promise.all(silhouetteStyles.map((style) => getDesigns({ style, limit: 50, sort: 'newest' }, locale))),
  ]);
  const items = designs.ok ? designs.data.items : [];
  const heroDesigns = heroPool.ok ? heroPool.data.items : items;
  // Per style: how many designs, and the newest with a real photo (the seed's drawings don't count: the cut is line-drawn instead).
  const shots = silhouetteStyles.map((style, i) => {
    const r = styleShots[i];
    const list = r?.ok ? r.data.items : [];
    return { style, count: list.length, design: list.find((d) => d.primaryImageUrl && !d.primaryImageUrl.includes('/seed/')) ?? null };
  });
  // The headline stays in its own column beside the photo card: big, editorial, never crossing it.
  const headlineClass = 'relative mt-5 text-[2.6rem] sm:text-[3.6rem] lg:text-[3.9rem] xl:text-[4.5rem] 2xl:text-[5rem]';

  return (
    <>
      {/* Hero: a full-width stage. Text starts 5% from the edge; the photo panel runs off the other edge. */}
      <section className="relative overflow-hidden bg-sand-50 lg:min-h-[min(86vh,900px)]">
        <ParallaxPattern size={76} className="text-accent-700/[0.07] [mask-image:radial-gradient(ellipse_60%_70%_at_30%_50%,black,transparent_80%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-40 size-[560px] rounded-full bg-mauve-200/60 blur-3xl motion-safe:animate-float" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-sand-200/70 via-sand-100/40 to-transparent" />
          <div className="absolute bottom-0 left-[12%] h-40 w-[50%] rounded-[100%] bg-gold-200/30 blur-3xl" />
        </div>

        <div className="relative flex min-h-[inherit] flex-col justify-center px-4 pb-6 pt-12 sm:px-8 lg:w-[47%] lg:ps-[5%] lg:pe-6 lg:pb-24 lg:pt-24">
          <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.28em] text-rose-600 motion-safe:animate-fade-up" style={enter(0)}>
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold-400 rtl:bg-gradient-to-l" aria-hidden />
            <EyebrowStar />
            {home.eyebrow}
          </p>
          <HeroHeadline id="hero-headline" parts={home.heroTitleParts} className={headlineClass} />
          <div className="max-w-md">
            <p className="mt-6 text-lg leading-relaxed text-neutral-700 motion-safe:animate-fade-up" style={enter(520)}>
              {home.heroBody}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4 motion-safe:animate-fade-up" style={enter(640)}>
              <Button asChild size="lg" variant="gold" className="uppercase tracking-[0.14em]">
                <Link href="/abayas">
                  {home.heroCta}
                  <ArrowRight className="rtl:-scale-x-100" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="link" className="text-sm uppercase tracking-[0.14em] text-accent-800">
                <Link href="#how-it-works">{home.heroSecondary}</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 pb-12 sm:px-8 lg:contents">
          <HeroShowcase designs={heroDesigns} />
        </div>
      </section>

      {/* Choose · Measure · Receive */}
      <ThreeSteps locale={locale} />

      {/* The atelier in numbers */}
      <section aria-label={home.numbersEyebrow} className="relative overflow-hidden bg-accent-900 text-white">
        <ParallaxPattern size={64} distance={30} className="text-gold-300/[0.09]" />
        <div className="container relative py-12 sm:py-14">
          <p className="flex items-center justify-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.3em] text-accent-200">
            <EyebrowStar className="text-gold-300" />
            {home.numbersEyebrow}
            <EyebrowStar className="text-gold-300" />
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 text-center lg:grid-cols-4">
            {home.numbers.map((n, i) => (
              <li key={n.unit} data-reveal style={delay(i * 110)}>
                <p className="font-display text-5xl font-semibold leading-none text-gold-200 sm:text-6xl">
                  <CountUp to={n.value} suffix={n.suffix} />
                </p>
                <p className="mt-2 font-display text-xl italic text-white">{n.unit}</p>
                <p className="mt-1 text-sm text-accent-100/75">{n.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Collections: a cinematic reel, pinned and gliding sideways as the page scrolls */}
      {collections.ok && collections.data.length > 0 && <CollectionReel collections={collections.data} />}

      {/* The atelier edit: new designs as a magazine spread, each card with quick view and customise */}
      <section className="relative bg-gradient-to-b from-background to-sand-50">
        <div className="container py-20 sm:py-24">
          <div data-reveal className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 sm:mb-10">
            <div className="max-w-3xl">
              <p className="mb-3 flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.28em] text-accent-700">
                <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold-400 rtl:bg-gradient-to-l" aria-hidden />
                <EyebrowStar />
                {home.editEyebrow}
              </p>
              <h2 className="font-display text-4xl leading-[1.05] text-foreground sm:text-5xl lg:text-[3.6rem]">
                <MaskedText text={home.editTitle} />
              </h2>
              <p className="mt-3 text-neutral-600">{home.editBody}</p>
            </div>
            <Link
              href="/abayas"
              className="group inline-flex items-center gap-2 border-b border-gold-400 pb-1 font-display text-lg text-foreground transition-colors hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-4"
            >
              {home.exploreAll}
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden />
            </Link>
          </div>
          {items.length > 0 ? (
            <DesignGrid>
              {items.map((d, i) => (
                <li key={d.id} data-reveal style={delay((i % 4) * 100)}>
                  <DesignCard design={d} priority={i < 2} />
                </li>
              ))}
            </DesignGrid>
          ) : (
            <EmptyState title={home.emptyDesigns} />
          )}

          {/* Explore silhouettes: one tile per style, each a real design photo */}
          <StarDivider className="my-14 sm:my-20" />
          <Silhouettes locale={locale} shots={shots} />
        </div>
      </section>

      {/* Craftsmanship: close-ups from the atelier's own photoshoots */}
      <Craftsmanship designs={items} />

      {/* From sketch to you */}
      <Journey designs={items} stepImages={journeyImages()} />

      {/* Closing invitation: a burgundy card with a double gold frame, a real abaya in an arch, and the promise */}
      <section className="container py-20 sm:py-24">
        <StarDivider className="mb-12" />
        <div data-reveal className="relative overflow-hidden rounded-[2rem] bg-accent-900 text-white shadow-[0_60px_120px_-60px_rgba(68,17,27,0.8)]">
          <MashrabiyaPattern size={64} className="text-gold-300/[0.09]" />
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 size-96 rounded-full bg-accent-700/50 blur-3xl" />
            <div className="absolute -bottom-32 -right-24 size-96 rounded-full bg-gold-500/15 blur-3xl" />
            {/* The double gold frame */}
            <div className="absolute inset-3 rounded-[1.6rem] border border-gold-300/40 sm:inset-4" />
            <div className="absolute inset-5 rounded-[1.3rem] border border-gold-300/20 sm:inset-7" />
          </div>
          <div className="relative grid items-center gap-10 px-8 py-14 sm:px-14 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:px-20 lg:py-20">
            <div>
              <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.28em] text-gold-200">
                <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold-300 rtl:bg-gradient-to-l" aria-hidden />
                <EyebrowStar className="text-gold-300" />
                {home.closingEyebrow}
              </p>
              <h2 className="mt-5 font-display text-4xl leading-[1.08] sm:text-5xl lg:text-[3.6rem]">
                <MaskedText text={home.closingTitle} />
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-accent-100/85 sm:text-lg">{home.closingBody}</p>
              <ul className="mt-7 grid gap-3 sm:grid-cols-3">
                {home.closingPoints.map((pt, i) => {
                  const Icon = [Ruler, Camera, RefreshCcw][i] ?? Ruler;
                  return (
                    <li key={pt} className="flex items-center gap-3 text-sm text-white/90">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gold-300/60 text-gold-200">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      {pt}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-9 flex flex-wrap items-center gap-5">
                <Button asChild size="lg" variant="gold">
                  <Link href="/abayas">
                    {home.closingCta}
                    <ArrowRight className="rtl:-scale-x-100" aria-hidden />
                  </Link>
                </Button>
                <Link href="#how-it-works" className="text-sm font-medium uppercase tracking-[0.14em] text-gold-100 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/70">
                  {home.heroSecondary}
                </Link>
              </div>
            </div>
            {/* The newest real abaya in a gold-lined arch, the lantern glowing above it */}
            <div className="relative mx-auto w-full max-w-[340px] lg:max-w-[380px]">
              <Lantern glow className="absolute -top-8 left-1/2 z-10 h-14 -translate-x-1/2 text-gold-300" />
              <div className="relative aspect-[4/5] overflow-hidden rounded-b-[1.5rem] rounded-t-full bg-accent-950 shadow-[0_50px_100px_-50px_rgba(0,0,0,0.9)]">
                <DesignImage
                  src={items.find((d) => d.primaryImageUrl && !d.primaryImageUrl.includes('/seed/'))?.primaryImageUrl ?? items[0]?.primaryImageUrl}
                  alt=""
                  name={home.closingEyebrow}
                  sizes="(min-width: 1024px) 380px, 80vw"
                  className="absolute inset-0 [&_img]:transition-transform [&_img]:duration-[2400ms] [&_img]:ease-out hover:[&_img]:scale-[1.05]"
                  imagePosition="50% 12%"
                />
                <span aria-hidden className="pointer-events-none absolute inset-x-[7%] bottom-0 top-[6%] rounded-t-full border border-gold-300/60" />
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-accent-950/80 to-transparent" />
              </div>
              <span aria-hidden className="absolute -inset-3 -z-10 rounded-b-[2rem] rounded-t-full border border-gold-300/25" />
            </div>
          </div>
          <ArabesqueBorder className="absolute inset-x-0 bottom-3 h-3 text-gold-300/40 sm:bottom-4" />
        </div>
      </section>
    </>
  );
}
