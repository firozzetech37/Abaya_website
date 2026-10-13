'use client';

import { env } from './env';

/**
 * Returns the current Clerk session token (or null when signed out). Registered
 * by the auth provider so this non-React module never imports Clerk directly.
 */
type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;
export function setTokenGetter(getter: TokenGetter | null): void {
  tokenGetter = getter;
}

async function getAccessToken(): Promise<string | null> {
  if (!tokenGetter) return null;
  try {
    return await tokenGetter();
  } catch {
    return null;
  }
}

/** A failed API call, parsed from `{ error: { code, message, details?, requestId? } }`. */
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

  get isForbidden(): boolean {
    return this.status === 403 && this.code !== 'MFA_REQUIRED';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

/** Listeners for errors that need app-wide handling (MFA step-up, expired session). */
type ErrorListener = (error: ApiError) => void;
const listeners = new Set<ErrorListener>();
export function onApiError(listener: ErrorListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${env.apiUrl}/v1${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const json = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } };
    if (json.error?.code) {
      return new ApiError(res.status, json.error.code, json.error.message ?? res.statusText, json.error.details, json.error.requestId);
    }
  } catch {
    // Non-JSON body; fall through to a generic error.
  }
  return new ApiError(res.status, `HTTP_${res.status}`, res.statusText || 'Request failed');
}

export async function apiRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  if (!res.ok) {
    const error = await parseError(res);
    listeners.forEach((l) => l(error));
    throw error;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    apiRequest<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, { body: body ?? {} }),
  put: <T>(path: string, body: unknown) => apiRequest<T>('PUT', path, { body }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>('PATCH', path, { body }),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
};

/** Message to show a user for any thrown value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
