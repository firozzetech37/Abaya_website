'use client';

/**
 * Try-ons still being made after the customer closed the dialog ("Keep browsing"). The site-wide
 * notifier (components/design/ai-ready-notifier.tsx) keeps checking them and shows a small notice
 * when each is ready. Kept in this tab's session storage, so moving between pages or reloading
 * keeps the watch; a picture is only hers for an hour, so older entries are dropped.
 */

export interface WatchedPicture {
  id: string;
  designSlug: string;
  designName: string;
  startedAt: number;
}

const KEY = 'abaya.ai-watch';
const EVENT = 'abaya:ai-watch';
const MAX_AGE_MS = 60 * 60_000;
const EMPTY: WatchedPicture[] = [];

let cache: { raw: string | null; list: WatchedPicture[] } = { raw: null, list: EMPTY };

function readRaw(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The watched pictures (the same array while nothing changed, as useSyncExternalStore needs). */
export function listWatched(): WatchedPicture[] {
  const raw = readRaw();
  if (raw === cache.raw) return cache.list;
  let list: WatchedPicture[] = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as WatchedPicture[]) : [];
    list = Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === 'string' && Date.now() - p.startedAt < MAX_AGE_MS) : EMPTY;
  } catch {
    list = EMPTY;
  }
  cache = { raw, list };
  return list;
}

function save(list: WatchedPicture[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private window without storage: the notice only works while she stays on this page.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function watchPicture(p: WatchedPicture) {
  save([...listWatched().filter((x) => x.id !== p.id), p]);
}

export function unwatchPicture(id: string) {
  const list = listWatched();
  if (list.some((x) => x.id === id)) save(list.filter((x) => x.id !== id));
}

export function subscribeWatched(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** The design page reads `?picture=<id>` to open a picture from the notice. */
export const PICTURE_PARAM = 'picture';
/** Already on that design page: the notice asks the AI studio to open the picture (detail: its id). */
export const OPEN_PICTURE_EVENT = 'abaya:open-picture';
