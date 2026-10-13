/**
 * "The photo flies into place": a product card remembers where its photo was on screen just
 * before the design page opens; the gallery then animates that photo from there into its
 * own frame (components/motion/fly-image.tsx). Kept in sessionStorage for a few seconds only.
 */
const KEY = 'abaya:fly';
const MAX_AGE_MS = 4_000;

export interface FlyFrom {
  src: string;
  rect: { x: number; y: number; w: number; h: number };
  at: number;
}

export function rememberFly(src: string, el: Element): void {
  const r = el.getBoundingClientRect();
  const from: FlyFrom = { src, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, at: Date.now() };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(from));
  } catch {
    // Storage blocked: the page just opens without the flight.
  }
}

/** The remembered start for this photo, taken once (null when there is none or it is stale). */
export function takeFly(src: string): FlyFrom | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const from = JSON.parse(raw) as FlyFrom;
    return from.src === src && Date.now() - from.at < MAX_AGE_MS ? from : null;
  } catch {
    return null;
  }
}
