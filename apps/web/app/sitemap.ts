import type { MetadataRoute } from 'next';
import { localizePath } from '@/content/i18n';
import { SITE_URL } from '@/lib/env';
import { getCollections, getDesigns } from '@/lib/server-api';

export const revalidate = 3600;

/** Every public page in English (plain URL) with its Arabic twin (/ar/...) as an alternate. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [designs, collections] = await Promise.all([getDesigns({ limit: 100 }), getCollections()]);
  const staticPaths = ['/', '/abayas', '/help', '/policies/returns-and-alterations', '/policies/shipping', '/policies/privacy', '/policies/terms', '/policies/grievance'];
  const paths = [
    ...staticPaths,
    ...(collections.ok ? collections.data.map((c) => `/collections/${c.slug}`) : []),
    ...(designs.ok ? designs.data.items.map((d) => `/abayas/${d.slug}`) : []),
  ];
  const url = (p: string) => `${SITE_URL}${p === '/' ? '' : p}`;
  return paths.flatMap((p) => {
    const languages = { en: url(p), ar: url(localizePath('ar', p)) };
    return [
      { url: languages.en, alternates: { languages } },
      { url: languages.ar, alternates: { languages } },
    ];
  });
}
