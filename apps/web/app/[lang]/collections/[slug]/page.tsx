import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CatalogBrowser } from '@/components/design/catalog-browser';
import { DesignCard, DesignGrid } from '@/components/design/design-card';
import { Alert } from '@/components/ui/misc';
import { EyebrowStar, StarPattern } from '@/components/ornament/geometric';
import { alternatesFor, stringsFor } from '@/content/i18n';
import { getCollection, getCollections, getDesigns } from '@/lib/server-api';

export const revalidate = 60;

type Props = { params: Promise<{ lang: string; slug: string }> };

export async function generateStaticParams() {
  const collections = await getCollections();
  return collections.ok ? collections.data.map((c) => ({ slug: c.slug })) : [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, strings: { catalog } } = await stringsFor(params);
  const { slug } = await params;
  const [collection, designs] = await Promise.all([getCollection(slug, locale), getDesigns({ collection: slug, limit: 1 }, locale)]);
  if (!collection.ok) return { title: catalog.collectionNotFound };
  const description = collection.data.description ?? catalog.collectionMetaDescription(collection.data.name);
  const image = designs.ok ? designs.data.items[0]?.primaryImageUrl : null;
  return {
    title: collection.data.name,
    description,
    alternates: alternatesFor(locale, `/collections/${slug}`),
    openGraph: { title: collection.data.name, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function CollectionPage({ params }: Props) {
  const { locale, strings } = await stringsFor(params);
  const { catalog, common, home } = strings;
  const { slug } = await params;
  const [collection, designs] = await Promise.all([getCollection(slug, locale), getDesigns({ collection: slug, limit: 12 }, locale)]);
  if (!collection.ok && collection.notFound) notFound();
  const initial = designs.ok ? designs.data : null;
  const name = collection.ok ? collection.data.name : slug;

  return (
    <div>
      <header className="relative overflow-hidden bg-sand-50">
        <StarPattern size={72} className="text-accent-700/[0.06] [mask-image:linear-gradient(to_left,black,transparent_70%)] rtl:[mask-image:linear-gradient(to_right,black,transparent_70%)]" />
        <div className="container relative py-12 sm:py-16">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-accent-700">
            <EyebrowStar />
            {home.collectionsTitle}
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">{name}</h1>
          {collection.ok && (
            <p className="mt-3 max-w-2xl text-neutral-600">
              {collection.data.description ?? catalog.collectionMetaDescription(collection.data.name)}
            </p>
          )}
        </div>
      </header>
      <div className="container py-10">
        {!collection.ok && <Alert tone="warning" className="mb-6">{common.apiDown}</Alert>}
        <Suspense
          fallback={
            <DesignGrid>
              {(initial?.items ?? []).map((d) => (
                <li key={d.id}>
                  <DesignCard design={d} />
                </li>
              ))}
            </DesignGrid>
          }
        >
          <CatalogBrowser initialPage={initial} collections={[]} fixedCollection={slug} />
        </Suspense>
      </div>
    </div>
  );
}
