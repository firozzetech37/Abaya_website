/**
 * The one typed fetch wrapper for talking to apps/api.
 * - Attaches `Authorization: Bearer <Clerk session token>` when a user is logged in.
 * - Parses `{ error: { code, message, details, requestId } }` into `ApiError`.
 * Every data call goes through here; the browser never talks to the database or storage directly.
 */
import { dictionaryFor } from '@/content/i18n';
import { API_URL } from './env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const pageIsArabic = () => typeof document !== 'undefined' && document.documentElement.lang === 'ar';
/** Messages in the page's language (read when the error happens; English on the server). */
const messages = () => dictionaryFor(pageIsArabic() ? 'ar' : 'en').common;

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** A user-safe message for any error thrown by an API call. */
export function errorMessage(e: unknown): string {
  if (!isApiError(e)) return messages().genericError;
  if (e.status === 0) return messages().networkError;
  // Arabic pages never show the API's English text: the message for its code, else the general one.
  if (pageIsArabic()) return dictionaryFor('ar').apiErrors[e.code] ?? messages().genericError;
  return e.message || messages().genericError;
}

/** A fixed message the API sent as text (an AI picture failure), in the page's language. */
export function serverText(text: string): string {
  if (!pageIsArabic()) return text;
  return dictionaryFor('ar').aiPictureErrors[text] ?? messages().genericError;
}

type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider = async () => null;

/** Registered by the AuthProvider so every client call carries the current access token. */
export function setTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Explicit token (server side); otherwise the registered provider is used. */
  token?: string | null;
  /** Skip the Authorization header (public catalog calls). */
  anonymous?: boolean;
  signal?: AbortSignal;
  /** Next.js fetch cache options for server components. */
  next?: { revalidate?: number | false; tags?: string[] };
  cache?: RequestCache;
}

export function buildUrl(path: string, query?: ApiRequestOptions['query']): string {
  const url = new URL(`/v1${path.startsWith('/') ? path : `/${path}`}`, API_URL);
  // On Arabic pages catalog text comes back in Arabic (the API translates only marked catalog fields).
  if (typeof document !== 'undefined' && document.documentElement.lang === 'ar' && !query?.lang) url.searchParams.set('lang', 'ar');
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, anonymous, signal, next, cache } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = options.token !== undefined ? options.token : await tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      ...(next ? { next } : {}),
      ...(cache ? { cache } : {}),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', messages().networkError);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | null)
      ?.error;
    throw new ApiError(
      response.status,
      err?.code ?? `HTTP_${response.status}`,
      err?.message ?? messages().genericError,
      err?.details,
      err?.requestId,
    );
  }
  return json as T;
}
