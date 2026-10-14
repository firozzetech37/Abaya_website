import { existsSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import type { FaceKeeper } from '../application/ports/try-on.ports';

/** UltraFace RFB-320 (MIT, onnx/models): finds faces in a 320x240 picture. */
const MODEL_FILE = 'ultraface-rfb-320.onnx';
const IN_W = 320;
const IN_H = 240;
/** In a full-length photo the face is in the top part: only that is searched (the face stays big enough). */
const SEARCH_TOP_SHARE = 0.55;
const MIN_FACE_SCORE = 0.7;
/**
 * How alike the two faces must look (pose, framing) before her real face replaces FASHN's.
 * Measured: same pose 0.96–0.99, same pose under a new background's light (sunset) 0.79,
 * a turned head 0.41.
 */
const MIN_POSE_MATCH = 0.75;

export interface FaceBox {
  score: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pearson correlation of two equally long greyscale buffers (1: same picture, 0: unrelated). */
export function correlation(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/**
 * "Face lock": FASHN redraws the whole picture, and in doing so retouches her face (smoother
 * skin, different nose or lips). After the try-on, her real face from her own photo is blended
 * back onto the result: found in both pictures, colour-matched to the new light, and laid in
 * with a soft oval that leaves her hijab, hair and the background from the result. When either
 * face cannot be found, or the head is not in the same position in both (FASHN turned it), the
 * result is left as it is: a misplaced face would look worse than a retouched one.
 */
export class OnnxFaceKeeper implements FaceKeeper {
  private readonly logger = new Logger('FaceKeeper');
  private session: Promise<ort.InferenceSession | null> | null = null;

  constructor(private readonly modelDirs: string[] = [path.resolve(process.cwd(), 'assets/models'), path.resolve(__dirname, '../assets/models')]) {}

  private load(): Promise<ort.InferenceSession | null> {
    this.session ??= (async () => {
      const file = this.modelDirs.map((d) => path.join(d, MODEL_FILE)).find((f) => existsSync(f));
      if (!file) {
        this.logger.warn('Face model not found: face lock is off');
        return null;
      }
      try {
        return await ort.InferenceSession.create(file, { logSeverityLevel: 3 });
      } catch (e) {
        this.logger.warn({ err: e instanceof Error ? e.message : e }, 'Face model could not load: face lock is off');
        return null;
      }
    })();
    return this.session;
  }

  /** The most confident face in the top part of the picture, in its pixels; null when none. */
  async detect(image: Buffer): Promise<FaceBox | null> {
    const session = await this.load();
    if (!session) return null;
    const meta = await sharp(image).rotate().metadata();
    const width = meta.autoOrient?.width ?? meta.width!;
    const height = meta.autoOrient?.height ?? meta.height!;
    const top = Math.max(1, Math.round(height * SEARCH_TOP_SHARE));
    const scale = Math.min(IN_W / width, IN_H / top);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(top * scale));
    const { data } = await sharp(image)
      .rotate()
      .extract({ left: 0, top: 0, width, height: top })
      .resize(w, h, { fit: 'fill' })
      .removeAlpha()
      .extend({ right: IN_W - w, bottom: IN_H - h, background: { r: 0, g: 0, b: 0 } })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const input = new Float32Array(3 * IN_W * IN_H);
    for (let i = 0; i < IN_W * IN_H; i++) for (let c = 0; c < 3; c++) input[c * IN_W * IN_H + i] = (data[i * 3 + c]! - 127) / 128;
    const out = await session.run({ input: new ort.Tensor('float32', input, [1, 3, IN_H, IN_W]) });
    const scores = out.scores!.data as Float32Array;
    const boxes = out.boxes!.data as Float32Array;
    let best: FaceBox | null = null;
    for (let i = 0; i < scores.length / 2; i++) {
      const s = scores[i * 2 + 1]!;
      if (s < MIN_FACE_SCORE || (best && s <= best.score)) continue;
      const x1 = (boxes[i * 4]! * IN_W) / scale;
      const y1 = (boxes[i * 4 + 1]! * IN_H) / scale;
      const x2 = (boxes[i * 4 + 2]! * IN_W) / scale;
      const y2 = (boxes[i * 4 + 3]! * IN_H) / scale;
      best = { score: s, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    if (!best) return null;
    // Keep the box inside the picture.
    const x = Math.max(0, Math.round(best.x));
    const y = Math.max(0, Math.round(best.y));
    return { score: best.score, x, y, w: Math.min(width - x, Math.round(best.w)), h: Math.min(height - y, Math.round(best.h)) };
  }

  async keepFace(original: Buffer, result: Buffer) {
    try {
      const [her, made] = await Promise.all([this.detect(original), this.detect(result)]);
      if (!her || !made || her.w < 16 || made.w < 16) return null;
      // Same framing of the head: the boxes have the same shape, and the faces look alike.
      if (Math.abs(her.w / her.h - made.w / made.h) > 0.2 * (made.w / made.h)) return null;
      const grey = (img: Buffer, b: FaceBox) =>
        sharp(img).rotate().extract({ left: b.x, top: b.y, width: b.w, height: b.h }).resize(24, 24, { fit: 'fill' }).greyscale().raw().toBuffer();
      const score = correlation(await grey(original, her), await grey(result, made));
      if (score < MIN_POSE_MATCH) return { data: result, contentType: 'image/jpeg', score, kept: false };

      const patch = await sharp(original).rotate().extract({ left: her.x, top: her.y, width: her.w, height: her.h }).resize(made.w, made.h, { fit: 'fill' }).removeAlpha().raw().toBuffer();
      const under = await sharp(result).extract({ left: made.x, top: made.y, width: made.w, height: made.h }).removeAlpha().raw().toBuffer();
      // Match the result's light: scale each colour so her face's average matches what is there now.
      const mean = (buf: Buffer) => [0, 1, 2].map((c) => {
        let t = 0;
        for (let i = c; i < buf.length; i += 3) t += buf[i]!;
        return t / (buf.length / 3);
      });
      const pm = mean(patch);
      const um = mean(under);
      const gains = pm.map((m, c) => Math.min(1.25, Math.max(0.8, um[c]! / Math.max(1, m))));
      // A soft oval over the face itself (eyes, nose, mouth, cheeks), not the hijab or hairline.
      const feather = Math.max(2, Math.round(Math.min(made.w, made.h) * 0.16));
      const mask = await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${made.w}" height="${made.h}"><ellipse cx="${made.w / 2}" cy="${made.h * 0.55}" rx="${made.w * 0.43 - feather / 2}" ry="${made.h * 0.47 - feather / 2}" fill="#fff"/></svg>`,
        ),
      )
        .blur(feather / 2)
        .extractChannel(0)
        .raw()
        .toBuffer();
      const rgba = Buffer.alloc(made.w * made.h * 4);
      for (let i = 0; i < made.w * made.h; i++) {
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.min(255, Math.round(patch[i * 3 + c]! * gains[c]!));
        rgba[i * 4 + 3] = mask[i]!;
      }
      const layer = await sharp(rgba, { raw: { width: made.w, height: made.h, channels: 4 } }).png().toBuffer();
      const data = await sharp(result).composite([{ input: layer, left: made.x, top: made.y }]).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      return { data, contentType: 'image/jpeg', score, kept: true };
    } catch (e) {
      this.logger.warn({ err: e instanceof Error ? e.message : e }, 'Face lock failed; the try-on is shown as FASHN made it');
      return null;
    }
  }
}

/** Tests and servers without the model: the try-on is shown as FASHN made it. */
export class NoFaceKeeper implements FaceKeeper {
  keepFace() {
    return Promise.resolve(null);
  }
}
