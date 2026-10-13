import { Inject, Injectable } from '@nestjs/common';
import {
  detectWatermark,
  embedWatermark,
  idPrefixOf,
  signalOf,
  type WatermarkKind,
  type WatermarkPayload,
} from '../domain/watermark';
import { VISIBLE_MARK_TEXT, visibleMarkSvg } from '../domain/visible-mark';

export interface RasterImage {
  /** Interleaved 8-bit RGB. */
  data: Uint8Array;
  width: number;
  height: number;
}

/** Port: turn files into pixels and back (sharp in production). */
export interface ImageRaster {
  /**
   * Upright, transparency flattened on white, RGB; the longest side capped at `maxSide` (never
   * enlarged). `overlay` (an SVG for the final size) is drawn over the picture.
   */
  decode(input: Buffer, maxSide?: number, overlay?: (width: number, height: number) => string): Promise<RasterImage>;
  /** RGB at `width` pixels wide (smaller pictures are not enlarged): what the reader looks at. */
  decodeAtWidth(input: Buffer, width: number): Promise<RasterImage>;
  /** JPEG with only a copyright notice in its metadata (no camera or location data). */
  encodeJpeg(image: RasterImage, options: { quality: number; copyright: string }): Promise<Buffer>;
}
export const IMAGE_RASTER = Symbol('IMAGE_RASTER');

/** Written into every marked file's metadata (lost by screenshots, kept by direct saves). */
export const COPYRIGHT_NOTICE = '© Abaya Atelier. Design and photograph protected. Personal viewing only; not for reuse or resale.';

/** About this wide is plenty for reading and keeps the position search to a second or two. */
const READ_WIDTH = 640;

export interface WatermarkReading extends WatermarkPayload {
  confidence: number;
}

/**
 * Invisible watermark for the pictures customers see (catalog web previews, AI previews and
 * try-ons). Other modules call `mark`; the admin "Check an image" tool calls `read`.
 */
@Injectable()
export class WatermarkService {
  constructor(@Inject(IMAGE_RASTER) private readonly raster: ImageRaster) {}

  /**
   * The customer-facing copy of a picture: upright, capped at `maxSide`, marked with what it is
   * (`kind`) and which record (`id`), JPEG with the copyright notice.
   */
  async mark(
    input: Buffer,
    mark: { kind: WatermarkKind; id: string },
    options: { maxSide?: number; quality?: number; visible?: boolean } = {},
  ): Promise<{ body: Buffer; contentType: 'image/jpeg'; width: number; height: number }> {
    // The visible mark (AI previews and try-ons only, never catalog photos) goes on first; the
    // invisible one is written over it.
    const text = options.visible && mark.kind !== 'DESIGN' ? VISIBLE_MARK_TEXT[mark.kind] : null;
    const overlay = text ? (w: number, h: number) => visibleMarkSvg(w, h, text) : undefined;
    const image = await this.raster.decode(input, options.maxSide, overlay);
    embedWatermark(image.data, image.width, image.height, 3, { kind: mark.kind, idPrefix: idPrefixOf(mark.id) });
    const body = await this.raster.encodeJpeg(image, { quality: options.quality ?? 85, copyright: COPYRIGHT_NOTICE });
    return { body, contentType: 'image/jpeg', width: image.width, height: image.height };
  }

  /** What the picture's mark says, or null when it has no readable mark. */
  async read(input: Buffer): Promise<WatermarkReading | null> {
    const image = await this.raster.decodeAtWidth(input, READ_WIDTH);
    const found = detectWatermark(signalOf(image.data, image.width, image.height, 3), image.width, image.height);
    return found ? { ...found.payload, confidence: found.confidence } : null;
  }
}
