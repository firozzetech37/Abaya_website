import { z } from 'zod';
import type { DesignStatus } from './enums';

/**
 * Admin "Check an image": a picture found elsewhere (Instagram, another shop) is uploaded to the
 * private bucket with purpose IMAGE_CHECK, then read for our invisible watermark. The file is
 * deleted straight after reading.
 */
export const imageCheckBody = z.object({ path: z.string().min(1).max(200) });
export type ImageCheckBody = z.infer<typeof imageCheckBody>;

export type ImageCheckKind = 'DESIGN' | 'PREVIEW' | 'TRYON';

export interface ImageCheckResultDto {
  /** A watermark was read. */
  found: boolean;
  /** Catalog photo, website AI preview, or try-on. */
  kind: ImageCheckKind | null;
  /** How clearly the mark stood out (0..1). */
  confidence: number | null;
  /** The design the picture shows (the catalog photo's design, or the design an AI picture was made from). */
  design: { id: string; name: string; slug: string; status: DesignStatus } | null;
  /** AI previews and try-ons: which request it was and who asked for it. */
  request: {
    id: string;
    kind: 'PREVIEW' | 'TRYON';
    createdAt: string;
    customer: { id: string; name: string | null; email: string | null } | null;
    choices: string[];
  } | null;
  /** A mark was read but its record no longer exists (e.g. a deleted design or try-on). */
  recordGone: boolean;
}
