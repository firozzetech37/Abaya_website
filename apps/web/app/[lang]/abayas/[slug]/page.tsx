import { formatINR, parseDescriptionSpecs } from '@abaya/contracts';
import { Camera, Clock, RefreshCcw } from 'lucide-react';
import { EyebrowStar } from '@/components/ornament/geometric';
import type { Metadata } from 'next';
import { Link } from '@/components/i18n/navigation';
import { notFound } from 'next/navigation';
import { ColourChoiceProvider } from '@/components/design/colour-choice';
import { Price } from '@/components/i18n/price';
import { DownloadOffer } from '@/components/design/download-offer';
import { OrderingSoonNote, WhenOrderingOpen } from '@/components/ordering/coming-soon';
import { Gallery } from '@/components/design/gallery';
import { RedesignPanel } from '@/components/design/redesign-panel';
import { WishlistButton } from '@/components/design/wishlist-button';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { alternatesFor, stringsFor } from '@/content/i18n';
import { SITE_URL } from '@/lib/env';
import { getDesign, getDesigns } from '@/lib/server-api';
import { cn } from '@/lib/utils';

export const revalidate = 60;

type Props = { params: Promise<{ lang: string; slug: string }> };

export async function generateStaticParams() {
  const designs = await getDesigns({ limit: 50 });
  return designs.ok ? designs.data.items.map((d) => ({ slug: d.slug })) : [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, strings: { common, design: t, styles } } = await stringsFor(params);
  const { slug } = await params;
  const res = await getDesign(slug, locale);
  if (!res.ok) return { title: t.notFoundTitle, robots: { index: false } };
  const d = res.data;
  const description =
    d.description ?? `${d.name} — ${styles[d.style]} abaya, made to order. ${common.from} ${formatINR(d.fromPriceInPaise)}.`;
  const image = d.images[0]?.url ?? d.primaryImageUrl;
  return {
    title: d.name,
    description,
    alternates: alternatesFor(locale, `/abayas/${d.slug}`),
    openGraph: {
      title: d.name,
      description,
      type: 'website',
      ...(image ? { images: [{ url: image, alt: d.images[0]?.alt ?? d.name }] } : {}),
    },
  };
}

export default async function DesignPage({ params }: Props) {
  const { locale, strings } = await stringsFor(params);
  const { brand, catalog, common, design: t, home, nav, styles } = strings;
  const { slug } = await params;
  const res = await getDesign(slug, locale);
  if (!res.ok) {
    if (res.notFound) notFound();
    return (
      <div className="container py-16">
        <EmptyState
          title={t.notFoundTitle}
          body={common.apiDown}
          action={
            <Button asChild variant="secondary">
              <Link href="/abayas">{catalog.title}</Link>
            </Button>
          }
        />
      </div>
    );
  }
  const d = res.data;
  // The colours the design is offered in; the gallery shows each colour's own photos.
  const colourValues = d.optionGroups.find((g) => g.code === 'COLOUR')?.values ?? [];
  const colours = colourValues.map((v) => ({ id: v.id, name: v.name, isDefault: v.isDefault }));
  // Named swatches when the colour options carry a shade; else the design's plain colour list.
  const swatches =
    colourValues.some((v) => v.colourHex)
      ? colourValues.filter((v) => v.colourHex).map((v) => ({ key: v.id, hex: v.colourHex!, name: v.name }))
      : d.colours.map((hex, i) => ({ key: `${hex}-${i}`, hex, name: null as string | null }));
  const specs = parseDescriptionSpecs(d.description);
  const promises = [
    { icon: Clock, title: t.promiseLeadTitle(d.leadTimeDays), body: t.promiseLeadBody },
    { icon: Camera, title: t.promisePhotosTitle, body: t.promisePhotosBody },
    { icon: RefreshCcw, title: t.promiseAlterTitle, body: t.promiseAlterBody },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: d.name,
    description: d.description ?? undefined,
    image: d.images.map((i) => i.url),
    brand: { '@type': 'Brand', name: brand.name },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: (d.fromPriceInPaise / 100).toFixed(2),
      availability: 'https://schema.org/MadeToOrder',
      url: `${SITE_URL}/abayas/${d.slug}`,
    },
  };

  return (
    <div className="container pb-28 pt-4 sm:pb-16 sm:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label={nav.breadcrumb} className="mb-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-foreground hover:underline">
              {nav.home}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/abayas" className="hover:text-foreground hover:underline">
              {catalog.title}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="truncate text-neutral-700">
            {d.name}
          </li>
        </ol>
      </nav>

      <ColourChoiceProvider initial={colours.find((c) => c.isDefault)?.id ?? null}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-14 xl:gap-20">
        <Gallery images={d.images} name={d.name} colours={colours} />

        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-accent-700">
                <span aria-hidden className="h-px w-8 bg-gradient-to-r from-gold-400 to-gold-200 rtl:bg-gradient-to-l" />
                {styles[d.style]}
              </p>
              <h1 className="mt-3 text-balance font-display text-4xl font-semibold leading-[1.08] tracking-[-0.01em] sm:text-5xl xl:text-[3.5rem]">
                {d.name}
              </h1>
            </div>
            <WishlistButton designId={d.id} />
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
            <p className="flex items-baseline gap-2">
              <span className="text-sm uppercase tracking-[0.18em] text-muted">{t.from}</span>
              <span className="font-display text-3xl font-semibold tabular-nums text-accent-900 sm:text-[2.1rem]">
                <Price paise={d.fromPriceInPaise} />
              </span>
            </p>
            <p className="pb-1 text-sm text-muted">{t.madeToMeasure}</p>
          </div>
          <OrderingSoonNote className="mt-3" />

          {swatches.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span className="uppercase tracking-[0.18em]">{t.availableIn}</span>
              <ul className="flex items-center gap-1.5" aria-label={home.colours(swatches.length)}>
                {swatches.map((c) => (
                  <li key={c.key} title={c.name ?? undefined}>
                    <span
                      className="block size-[1.1rem] rounded-full border border-white shadow-[0_0_0_1px_rgba(35,28,23,0.18),0_2px_6px_-2px_rgba(35,28,23,0.35)]"
                      style={{ backgroundColor: c.hex }}
                    />
                    {c.name ? <span className="sr-only">{c.name}</span> : null}
                  </li>
                ))}
              </ul>
              <span>{t.colourCount(swatches.length)}</span>
            </div>
          )}

          {/* What every abaya comes with */}
          <ul aria-label={t.promisesLabel} className="mt-7 grid grid-cols-3 overflow-hidden rounded-2xl border border-gold-200/70 bg-gradient-to-b from-surface to-sand-50">
            {promises.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className={cn('flex flex-col items-center px-2 py-4 text-center sm:px-4', i > 0 && 'border-s border-gold-200/60')}>
                <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-b from-gold-100 to-gold-200/70 text-accent-800 ring-1 ring-gold-300/60">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="mt-2 font-display text-[0.95rem] font-semibold leading-tight text-foreground sm:text-base">{title}</span>
                <span className="mt-1 text-[0.7rem] leading-snug text-muted sm:text-xs">{body}</span>
              </li>
            ))}
          </ul>

          {specs ? (
            <section aria-labelledby="details-title" className="mt-7">
              <h2 id="details-title" className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-accent-700">
                <EyebrowStar className="size-3.5" />
                {t.detailsTitle}
              </h2>
              <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">
                {specs.map((sp) => (
                  <div key={sp.label} className="flex items-baseline justify-between gap-4 border-b border-dashed border-gold-200/80 py-2.5 text-sm">
                    {/* Designers write these in their own language: each side takes its own direction. */}
                    <dt dir="auto" className="shrink-0 text-muted">{sp.label}</dt>
                    <dd dir="auto" className="text-end font-medium text-foreground">{sp.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : d.description ? (
            <p className="mt-7 text-pretty text-[0.95rem] leading-relaxed text-neutral-700">{d.description}</p>
          ) : null}

          <div className="mt-8">
            <RedesignPanel design={d} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">{t.aboutMadeToOrder}</p>
          {d.download ? (
            <WhenOrderingOpen>
              <DownloadOffer design={{ id: d.id, name: d.name }} offer={d.download} />
            </WhenOrderingOpen>
          ) : null}
        </div>
      </div>
      </ColourChoiceProvider>
    </div>
  );
}
