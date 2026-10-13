import type { DesignCard } from '@abaya/contracts';

/** A photo narrower than this would be enlarged in the hero card and go soft; such designs stay off the hero. */
export const MIN_HERO_PHOTO_WIDTH = 1000;
export const MAX_HERO_LOOKS = 5;

/**
 * The hero's looks: the newest designs with a photo large enough (or a landscape photo).
 * Unknown width (older uploads) is allowed. A plain module, so the server page and the client
 * slideshow agree on which abaya comes first.
 */
export function heroLooks(designs: DesignCard[], failed: readonly string[] = []): DesignCard[] {
  return designs
    .filter((d) => d.primaryImageUrl && !failed.includes(d.primaryImageUrl))
    .filter((d) => d.wideImageUrl || d.primaryImageWidth === null || d.primaryImageWidth >= MIN_HERO_PHOTO_WIDTH)
    .slice(0, MAX_HERO_LOOKS);
}
