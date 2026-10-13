/**
 * Port: re-encode an uploaded photo so nothing but the picture is kept — EXIF (GPS location,
 * camera, time) is dropped, the photo is turned upright and capped in size.
 */
export interface ImageCleaner {
  clean(input: Buffer): Promise<{ body: Buffer; contentType: string; width: number; height: number }>;
  /** The customer-facing copy: web size (1600px), JPEG, no metadata. */
  preview(input: Buffer): Promise<{ body: Buffer; contentType: 'image/jpeg' }>;
  /** A bought HD file: full size, with the licence notice in its metadata. */
  stamp(input: Buffer, notice: string): Promise<{ body: Buffer; contentType: 'image/jpeg' }>;
}
export const IMAGE_CLEANER = Symbol('IMAGE_CLEANER');

/** Longest side kept for design photos and sketches. */
export const MAX_IMAGE_SIDE = 2400;

/** Longest side of the web previews customers see (large enough for the hero card on Retina screens). */
export const PREVIEW_IMAGE_SIDE = 1600;

/**
 * The version of the web-preview code. Raise it when previews must be remade: photos whose public
 * copy is older are redone once at start-up. 1 = invisible watermark (design id) + copyright notice.
 */
export const PREVIEW_GENERATION = 1;
