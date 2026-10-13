import { describe, expect, it } from 'vitest';
import { detectWatermark, embedWatermark, idPrefixOf, payloadBits, PAYLOAD_BITS, readPayload, signalOf } from './watermark';

/** A textured test picture (like fabric): smooth gradients plus seeded noise. */
function picture(width: number, height: number, seed = 7): Uint8Array {
  let s = seed;
  const rand = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = 90 + 60 * Math.sin(x / 37) * Math.cos(y / 53) + 40 * rand();
      const p = (y * width + x) * 3;
      data[p] = base + 30;
      data[p + 1] = base;
      data[p + 2] = base - 20;
    }
  }
  return data;
}

/** Nearest-neighbour crop and rescale, like a rough screenshot. */
function cropScale(data: Uint8Array, width: number, height: number, box: { x: number; y: number; w: number; h: number }, outW: number) {
  const outH = Math.round((box.h / box.w) * outW);
  const out = new Uint8Array(outW * outH * 3);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(width - 1, Math.max(0, Math.round(box.x + (x / outW) * box.w)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(box.y + (y / outH) * box.h)));
      for (let c = 0; c < 3; c++) out[(y * outW + x) * 3 + c] = data[(sy * width + sx) * 3 + c]!;
    }
  }
  return { data: out, width: outW, height: outH };
}

describe('invisible watermark', () => {
  it('packs the kind and the first 32 bits of the id, protected by a checksum', () => {
    const bits = payloadBits({ kind: 'PREVIEW', idPrefix: '2e7ec11b' });
    expect(bits).toHaveLength(PAYLOAD_BITS);
    expect(readPayload(bits)).toEqual({ kind: 'PREVIEW', idPrefix: '2e7ec11b' });
    for (const i of [0, 5, 20, 40]) {
      const flipped = [...bits];
      flipped[i] = 1 - flipped[i]!;
      expect(readPayload(flipped)).toBeNull();
    }
    expect(idPrefixOf('2E7EC11B-684F-4451-9ED1-015483BECCEC')).toBe('2e7ec11b');
  });

  it('changes the picture by only a few levels', () => {
    const before = picture(240, 300);
    const after = new Uint8Array(before);
    embedWatermark(after, 240, 300, 3, { kind: 'DESIGN', idPrefix: 'a1b2c3d4' });
    let max = 0;
    for (let i = 0; i < after.length; i++) max = Math.max(max, Math.abs(after[i]! - before[i]!));
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(12);
  });

  it('reads the mark back as published, and from a rough crop at another size', () => {
    const width = 480;
    const height = 600;
    const data = picture(width, height);
    embedWatermark(data, width, height, 3, { kind: 'TRYON', idPrefix: '0f00ba11' });
    const exact = detectWatermark(signalOf(data, width, height, 3), width, height);
    expect(exact?.payload).toEqual({ kind: 'TRYON', idPrefix: '0f00ba11' });

    const shot = cropScale(data, width, height, { x: 9, y: -6, w: width - 20, h: height - 30 }, 400);
    const found = detectWatermark(signalOf(shot.data, shot.width, shot.height, 3), shot.width, shot.height);
    expect(found?.payload).toEqual({ kind: 'TRYON', idPrefix: '0f00ba11' });
  }, 30_000);

  it('finds nothing in an unmarked picture', () => {
    const data = picture(300, 375, 11);
    expect(detectWatermark(signalOf(data, 300, 375, 3), 300, 375)).toBeNull();
  }, 30_000);
});
