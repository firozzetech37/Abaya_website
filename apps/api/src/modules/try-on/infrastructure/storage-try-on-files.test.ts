import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { ObjectStorage } from '../../../common/storage/object-storage';
import { StorageTryOnFiles } from './storage-try-on-files';

/** An in-memory private bucket that counts writes. */
function fakeStorage(files: Record<string, Buffer>) {
  let puts = 0;
  const storage = {
    get: async (_bucket: string, path: string) => files[path] ?? null,
    put: async (_bucket: string, path: string, data: Buffer) => {
      puts++;
      files[path] = data;
    },
  } as unknown as ObjectStorage;
  return { storage, puts: () => puts };
}

describe('try-on copy of a design photo', () => {
  it('sends FASHN a small JPEG made once, then reused', async () => {
    const original = await sharp({ create: { width: 3000, height: 4000, channels: 4, background: '#7a2e3b' } }).png().toBuffer();
    const files: Record<string, Buffer> = { 'design-images/a.png': original };
    const { storage, puts } = fakeStorage(files);
    const svc = new StorageTryOnFiles(storage);

    const copy = await svc.tryOnSource('design-images/a.png', 2048);
    expect(copy).toMatch(/^tryon-sources\/[0-9a-f]{32}-2048\.jpg$/);
    const meta = await sharp(files[copy]!).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width!, meta.height!)).toBe(2048);
    expect(files[copy]!.length).toBeLessThan(original.length);

    expect(await svc.tryOnSource('design-images/a.png', 2048)).toBe(copy);
    expect(puts()).toBe(1);
  });

  it('uses the original when it cannot make a copy', async () => {
    const { storage } = fakeStorage({ 'design-images/bad.png': Buffer.from('not an image') });
    const svc = new StorageTryOnFiles(storage);
    expect(await svc.tryOnSource('design-images/bad.png', 2048)).toBe('design-images/bad.png');
    expect(await svc.tryOnSource('design-images/missing.png', 2048)).toBe('design-images/missing.png');
  });
});
