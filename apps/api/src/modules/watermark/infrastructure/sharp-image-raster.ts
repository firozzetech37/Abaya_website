import { Injectable } from '@nestjs/common';
import sharp, { type OutputInfo } from 'sharp';
import { BusinessRuleError } from '../../../common/errors/domain-error';
import type { ImageRaster, RasterImage } from '../application/watermark.service';

const unreadable = () => new BusinessRuleError('INVALID_IMAGE', 'This file is not a readable photo.');

@Injectable()
export class SharpImageRaster implements ImageRaster {
  async decode(input: Buffer, maxSide?: number, overlay?: (width: number, height: number) => string): Promise<RasterImage> {
    let image: { data: Buffer; info: OutputInfo };
    try {
      let pipeline = sharp(input, { failOn: 'error' }).rotate();
      if (maxSide) pipeline = pipeline.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
      image = await pipeline.flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    } catch {
      throw unreadable();
    }
    const { width, height } = image.info;
    if (!overlay) return { data: new Uint8Array(image.data), width, height };
    const drawn = await sharp(image.data, { raw: { width, height, channels: 3 } })
      .composite([{ input: Buffer.from(overlay(width, height)), top: 0, left: 0 }])
      .removeAlpha()
      .raw()
      .toBuffer();
    return { data: new Uint8Array(drawn), width, height };
  }

  async decodeAtWidth(input: Buffer, width: number): Promise<RasterImage> {
    try {
      const { data, info } = await sharp(input, { failOn: 'error' })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data: new Uint8Array(data), width: info.width, height: info.height };
    } catch {
      throw unreadable();
    }
  }

  encodeJpeg(image: RasterImage, options: { quality: number; copyright: string }): Promise<Buffer> {
    return sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 3 } })
      .jpeg({ quality: options.quality, mozjpeg: true })
      .withExif({ IFD0: { Copyright: options.copyright, Artist: 'Abaya Atelier' } })
      .toBuffer();
  }
}
