import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { correlation, OnnxFaceKeeper } from './onnx-face-keeper';

const models = [path.resolve(__dirname, '../../../../assets/models')];
// Our own model photo and the AI try-on made from it (the home page's before/after demo).
const demo = path.resolve(__dirname, '../../../../../web/public/try-on-demo');
const before = readFileSync(path.join(demo, 'before.webp'));
const after = readFileSync(path.join(demo, 'after.webp'));

describe('face lock', () => {
  it('scores how alike two pictures are', () => {
    const a = Uint8Array.from({ length: 64 }, (_, i) => i * 3);
    expect(correlation(a, a)).toBeCloseTo(1);
    expect(correlation(a, Uint8Array.from(a).reverse())).toBeCloseTo(-1);
    expect(correlation(a, new Uint8Array(64))).toBe(0);
  });

  it('finds her face in a full-length photo', async () => {
    const face = await new OnnxFaceKeeper(models).detect(before);
    expect(face).not.toBeNull();
    expect(face!.score).toBeGreaterThan(0.9);
    // Near the top middle of a full-length photo.
    const { width, height } = await sharp(before).metadata();
    expect(face!.y + face!.h / 2).toBeLessThan(height! * 0.35);
    expect(Math.abs(face!.x + face!.w / 2 - width! / 2)).toBeLessThan(width! * 0.25);
  });

  it('puts her real face back on a try-on with the same pose, and leaves the rest of the picture', async () => {
    const kept = await new OnnxFaceKeeper(models).keepFace(before, after);
    expect(kept).not.toBeNull();
    expect(kept!.kept).toBe(true);
    expect(kept!.score).toBeGreaterThan(0.85);
    const out = await sharp(kept!.data).metadata();
    const src = await sharp(after).metadata();
    expect([out.width, out.height]).toEqual([src.width, src.height]);
  });

  it('does nothing without a face, or without the model', async () => {
    const plain = await sharp({ create: { width: 400, height: 700, channels: 3, background: '#7a2e3b' } }).jpeg().toBuffer();
    expect(await new OnnxFaceKeeper(models).keepFace(plain, after)).toBeNull();
    expect(await new OnnxFaceKeeper(['/no/such/dir']).keepFace(before, after)).toBeNull();
  });
});
