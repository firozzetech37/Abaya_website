import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { BusinessRuleError } from '../../../common/errors/domain-error';
import { type ImageCleaner, MAX_IMAGE_SIDE, PREVIEW_IMAGE_SIDE } from '../application/image-cleaner';

/** sharp drops all metadata unless asked to keep it; we only apply the EXIF rotation first. */
@Injectable()
export class SharpImageCleaner implements ImageCleaner {
  async clean(input: Buffer) {
    try {
      const image = sharp(input, { failOn: 'error' }).rotate();
      const meta = await image.metadata();
      const resized = image.resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true });
      const format = meta.format === 'png' ? 'png' : meta.format === 'webp' ? 'webp' : 'jpeg';
      const encoded =
        format === 'png'
          ? resized.png({ compressionLevel: 9 })
          : format === 'webp'
            ? resized.webp({ quality: 88 })
            : resized.jpeg({ quality: 88, mozjpeg: true });
      const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
      return { body: data, contentType: `image/${format}`, width: info.width, height: info.height };
    } catch {
      throw new BusinessRuleError('INVALID_IMAGE', 'This file is not a readable photo.');
    }
  }

  async preview(input: Buffer) {
    // A clean web-size copy (no visible watermark): the full-quality original stays private.
    const body = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: PREVIEW_IMAGE_SIDE, height: PREVIEW_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { body, contentType: 'image/jpeg' as const };
  }

  async stamp(input: Buffer, notice: string) {
    const body = await sharp(input, { failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92, mozjpeg: true })
      // Only these fields are written: who it is licensed to, never camera or location data.
      .withExif({ IFD0: { Copyright: notice, ImageDescription: notice, Artist: 'Abaya' } })
      .toBuffer();
    return { body, contentType: 'image/jpeg' as const };
  }
}
