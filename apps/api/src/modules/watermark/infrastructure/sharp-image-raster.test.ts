import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { COPYRIGHT_NOTICE, WatermarkService } from '../application/watermark.service';
import { SharpImageRaster } from './sharp-image-raster';

/** A textured JPEG like a product photo. */
async function photo(width: number, height: number): Promise<Buffer> {
  const noise = Buffer.alloc(width * height * 3);
  let s = 3;
  for (let i = 0; i < noise.length; i += 3) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const p = i / 3;
    const v = 110 + 50 * Math.sin((p % width) / 23) * Math.cos(Math.floor(p / width) / 31) + (s % 50);
    noise[i] = v + 25;
    noise[i + 1] = v;
    noise[i + 2] = v - 25;
  }
  return sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

describe('WatermarkService with sharp', () => {
  const service = new WatermarkService(new SharpImageRaster());

  it('marks a photo at web size with the copyright notice, and reads it back after a JPEG re-save', async () => {
    const marked = await service.mark(await photo(1000, 1250), { kind: 'DESIGN', id: '2e7ec11b-684f-4451-9ed1-015483beccec' }, { maxSide: 800 });
    expect(marked).toMatchObject({ contentType: 'image/jpeg', width: 640, height: 800 });
    const meta = await sharp(marked.body).metadata();
    expect(meta.exif?.toString('latin1')).toContain(COPYRIGHT_NOTICE.slice(2, 30));
    const resaved = await sharp(marked.body).jpeg({ quality: 70 }).toBuffer();
    expect(await service.read(resaved)).toMatchObject({ kind: 'DESIGN', idPrefix: '2e7ec11b' });
  }, 60_000);

  it('says nothing about an unmarked photo', async () => {
    expect(await service.read(await photo(600, 750))).toBeNull();
  }, 60_000);
});
