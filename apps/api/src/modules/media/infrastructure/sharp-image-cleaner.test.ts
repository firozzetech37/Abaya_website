import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SharpImageCleaner } from './sharp-image-cleaner';

describe('SharpImageCleaner', () => {
  const cleaner = new SharpImageCleaner();
  const photo = () =>
    sharp({ create: { width: 2000, height: 2500, channels: 3, background: '#202020' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'gps-secret' } })
      .toBuffer();

  it('makes a clean, smaller JPEG preview without the original metadata', async () => {
    const original = await photo();
    const preview = await cleaner.preview(original);
    const meta = await sharp(preview.body).metadata();
    expect(preview.contentType).toBe('image/jpeg');
    expect([meta.width, meta.height]).toEqual([1280, 1600]);
    expect(preview.body.includes(Buffer.from('gps-secret'))).toBe(false);
    // No visible watermark: a plain dark photo stays plain dark.
    const max = await sharp(preview.body).stats().then((s) => s.channels[0]!.max);
    expect(max).toBeLessThan(60);
  });

  it('stamps a full-size copy with only the licence notice', async () => {
    const stamped = await cleaner.stamp(await photo(), 'Licence L-123');
    const meta = await sharp(stamped.body).metadata();
    expect(meta.width).toBe(2000);
    expect(stamped.body.includes(Buffer.from('Licence L-123'))).toBe(true);
    expect(stamped.body.includes(Buffer.from('gps-secret'))).toBe(false);
  });
});
