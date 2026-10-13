import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CatalogBrowser } from '@/components/design/catalog-browser';
import { DesignCard, DesignGrid } from '@/components/design/design-card';
import { Alert } from '@/components/ui/misc';
import { EyebrowStar } from '@/components/ornament/geometric';
import { alternatesFor, stringsFor } from '@/content/i18n';
import { getCollections, getDesignFacets, getDesigns } from '@/lib/server-api';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { locale, strings: { catalog } } = await stringsFor(params);
  const first = await getDesigns({ limit: 1 }, locale);
  const image = first.ok ? first.data.items[0]?.primaryImageUrl : null;
  return {
    title: catalog.metaTitle,
    description: catalog.metaDescription,
    alternates: alternatesFor(locale, '/abayas'),
    openGraph: { title: catalog.metaTitle, description: catalog.metaDescription, ...(image ? { images: [image] } : {}) },
  };
}

export default async function AbayasPage({ params }: { params: Promise<{ lang: string }> }) {
  const { locale, strings } = await stringsFor(params);
  const { catalog, common } = strings;
  const [designs, collections, facets] = await Promise.all([
    getDesigns({ limit: 12 }, locale),
    getCollections(locale),
    getDesignFacets(locale),
  ]);
  const initial = designs.ok ? designs.data : null;
  const counts = facets.ok ? facets.data : null;
  const styleCount = counts?.styles.filter((s) => s.count > 0).length ?? 0;

  return (
    <div className="container py-10 sm:py-14">
      <header className="relative mb-12 flex flex-col gap-6 sm:mb-14 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.3em] text-gold-600">
            <EyebrowStar className="size-4" />
            {catalog.eyebrow}
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">{catalog.title}</h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-neutral-600 sm:text-lg">{catalog.subtitle}</p>
        </div>
        {counts && counts.total > 0 && (
          <dl className="flex shrink-0 gap-8 [&>div]:flex [&>div]:flex-col-reverse border-s border-gold-300 ps-6 sm:mb-2">
            <div>
              <dd className="font-display text-4xl text-accent-900">{counts.total}</dd>
              <dt className="text-xs uppercase tracking-[0.2em] text-neutral-600">{catalog.statDesigns}</dt>
            </div>
            <div>
              <dd className="font-display text-4xl text-accent-900">{styleCount}</dd>
              <dt className="text-xs uppercase tracking-[0.2em] text-neutral-600">{catalog.statStyles}</dt>
            </div>
          </dl>
        )}
      </header>
      {!designs.ok && <Alert tone="warning" className="mb-6">{common.apiDown}</Alert>}
      <Suspense
        fallback={
          // Server-rendered first page (SEO + no-JS); the client browser takes over on hydration.
          <DesignGrid>
            {(initial?.items ?? []).map((d) => (
              <li key={d.id}>
                <DesignCard design={d} />
              </li>
            ))}
          </DesignGrid>
        }
      >
        <CatalogBrowser
          initialPage={initial}
          initialFacets={counts}
          collections={collections.ok ? collections.data : []}
        />
      </Suspense>
    </div>
  );
}
