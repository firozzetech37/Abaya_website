import type { CollectionDto, DesignCard, DesignDetail, DesignFacets, ListDesignsQuery, Paginated } from '@abaya/contracts';
import { api, isApiError } from './api-client';

/**
 * Public catalog reads for server components. ISR-cached for 60 s and never throw:
 * when the API is down the page renders an empty state instead of failing the build.
 */
const REVALIDATE = 60;

export type Loaded<T> = { ok: true; data: T } | { ok: false; notFound: boolean };

async function load<T>(path: string, query?: Record<string, string | number | undefined>): Promise<Loaded<T>> {
  try {
    const data = await api<T>(path, { anonymous: true, query, next: { revalidate: REVALIDATE } });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, notFound: isApiError(e) && e.status === 404 };
  }
}

export type DesignListParams = Partial<Pick<ListDesignsQuery, 'style' | 'collection' | 'sort' | 'limit'>>;

/** `lang`: the page's language; Arabic pages get the catalog text in Arabic (cached per language). */
type Lang = string | undefined;
const langQuery = (lang: Lang) => (lang === 'ar' ? { lang: 'ar' } : {});

export const getDesigns = (params: DesignListParams = {}, lang?: Lang) =>
  load<Paginated<DesignCard>>('/designs', { limit: 12, sort: 'newest', ...params, ...langQuery(lang) });

export const getDesignFacets = (lang?: Lang) => load<DesignFacets>('/designs/facets', langQuery(lang));

export const getDesign = (slug: string, lang?: Lang) => load<DesignDetail>(`/designs/${encodeURIComponent(slug)}`, langQuery(lang));

export const getCollections = (lang?: Lang) => load<CollectionDto[]>('/collections', langQuery(lang));

export const getCollection = (slug: string, lang?: Lang) => load<CollectionDto>(`/collections/${encodeURIComponent(slug)}`, langQuery(lang));
