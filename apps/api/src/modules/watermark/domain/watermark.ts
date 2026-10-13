/**
 * Invisible watermark for customer-facing images (plain TypeScript, no image library).
 *
 * The picture is divided into square cells, WATERMARK_COLS across (rows follow the height).
 * Each cell carries one bit of a 72-bit code: [magic 8][kind 8][id 48][crc 8]. A bit is
 * written as a faint pattern of CHIPS×CHIPS soft blobs (a raised-cosine window, so there are
 * no edges to see), each blob lightening or darkening the pixel by a couple of levels, its sign
 * set by a keyed pseudo-random pattern times the bit. Which bit a cell carries is also keyed, so
 * every bit is spread over the whole picture; busy areas (embroidery) take a slightly stronger
 * mark than smooth ones (sand, sky), where it would show.
 *
 * Reading correlates the picture's fine detail with the expected pattern and adds the votes for
 * each bit. A screenshot is usually rescaled and cropped by hand, so reading searches over scale
 * and position for the grid and accepts the first placement whose magic byte and checksum match.
 * It survives re-saving as JPEG and normal screenshots; heavy cropping, strong resizing, filters
 * or a photo of the screen can destroy it.
 */

export const WATERMARK_COLS = 24;
const CHIPS = 4;
export const PAYLOAD_BITS = 44;
const ID_BITS = 32;
const CRC_BITS = 10;
/** Mixed into every pattern so the mark cannot be read (or forged) without it. */
const DEFAULT_KEY = 0x5eed_a7e1;

export type WatermarkKind = 'DESIGN' | 'PREVIEW' | 'TRYON';
const KIND_CODE: Record<WatermarkKind, number> = { DESIGN: 1, PREVIEW: 2, TRYON: 3 };
/** Kind (2 bits) and the id prefix (32 bits) are protected by a 10-bit checksum. */
const CODE_KIND = new Map(Object.entries(KIND_CODE).map(([k, v]) => [v, k as WatermarkKind]));

export interface WatermarkPayload {
  kind: WatermarkKind;
  /** The first 8 hex digits of the record's UUID (32 bits): enough to find it again. */
  idPrefix: string;
}

/** The first 32 bits of a UUID as 8 lowercase hex digits (the part before its first dash). */
export const idPrefixOf = (uuid: string): string => uuid.replace(/-/g, '').slice(0, 8).toLowerCase();

/** A 10-bit CRC (polynomial x¹⁰+x⁹+x⁵+x⁴+x+1) over a bit string. */
function crc10(bits: number[]): number[] {
  const poly = 0x233;
  let reg = 0;
  for (const bit of bits) {
    const top = ((reg >> (CRC_BITS - 1)) & 1) ^ bit;
    reg = ((reg << 1) & ((1 << CRC_BITS) - 1)) ^ (top ? poly & ((1 << CRC_BITS) - 1) : 0);
  }
  return Array.from({ length: CRC_BITS }, (_, i) => (reg >> (CRC_BITS - 1 - i)) & 1);
}

const toBits = (value: number, length: number) => Array.from({ length }, (_, i) => Math.floor(value / 2 ** (length - 1 - i)) % 2);

export function payloadBits(payload: WatermarkPayload): number[] {
  if (!/^[0-9a-f]{8}$/.test(payload.idPrefix)) throw new Error('idPrefix must be 8 hex digits');
  const data = [...toBits(KIND_CODE[payload.kind], 2), ...toBits(parseInt(payload.idPrefix, 16), ID_BITS)];
  return [...data, ...crc10(data)];
}

export function readPayload(bits: number[]): WatermarkPayload | null {
  if (bits.length !== PAYLOAD_BITS) return null;
  const data = bits.slice(0, 2 + ID_BITS);
  const crc = bits.slice(2 + ID_BITS);
  if (crc10(data).some((b, i) => b !== crc[i])) return null;
  const kind = CODE_KIND.get(data[0]! * 2 + data[1]!);
  if (!kind) return null;
  const id = data.slice(2).reduce((n, b) => n * 2 + b, 0);
  return { kind, idPrefix: id.toString(16).padStart(8, '0') };
}

/** A small integer hash (deterministic, keyed): which bit a cell carries and each blob's sign. */
function hash(key: number, a: number, b: number, c = 0): number {
  let h = (key ^ Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35) ^ Math.imul(c + 0x1656, 0x27d4eb2f)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const bitOfCell = (key: number, row: number, col: number) => hash(key, row, col, 0x51) % PAYLOAD_BITS;
const chipSign = (key: number, row: number, col: number, chip: number) => (hash(key, row, col, chip + 1) & 1 ? 1 : -1);

/** Precomputed keyed tables for `rows` rows: each cell's bit, and each blob's sign. */
interface Tables {
  rows: number;
  bit: Uint8Array; // [row * COLS + col]
  sign: Int8Array; // [(row * COLS + col) * CHIPS² + chip]
}
function tablesFor(key: number, rows: number): Tables {
  const n = rows * WATERMARK_COLS;
  const bit = new Uint8Array(n);
  const sign = new Int8Array(n * CHIPS * CHIPS);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < WATERMARK_COLS; col++) {
      const c = row * WATERMARK_COLS + col;
      bit[c] = bitOfCell(key, row, col);
      for (let k = 0; k < CHIPS * CHIPS; k++) sign[c * CHIPS * CHIPS + k] = chipSign(key, row, col, k);
    }
  }
  return { rows, bit, sign };
}

/**
 * What the reader looks at: luma plus the blue-yellow difference (scaled to luma's range), so
 * both parts of the mark add up. Pass interleaved 8-bit RGB or RGBA.
 */
export function signalOf(data: Uint8Array, width: number, height: number, channels: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += channels) {
    const r = data[p]!;
    const g = data[p + 1]!;
    const bl = data[p + 2]!;
    const y = 0.299 * r + 0.587 * g + 0.114 * bl;
    const cb = -0.1687 * r - 0.3313 * g + 0.5 * bl;
    out[i] = y + 2 * cb;
  }
  return out;
}

/** Rec. 601 luma of interleaved pixels (3 or 4 channels). */
export function lumaOf(data: Uint8Array, width: number, height: number, channels: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += channels) out[i] = 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
  return out;
}

/** Box blur with a summed-area table (radius in pixels). */
function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const w1 = width + 1;
  const sat = new Float64Array(w1 * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += src[y * width + x]!;
      sat[(y + 1) * w1 + x + 1] = sat[y * w1 + x + 1]! + row;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum = sat[y1 * w1 + x1]! - sat[y0 * w1 + x1]! - sat[y1 * w1 + x0]! + sat[y0 * w1 + x0]!;
      out[y * width + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

export interface EmbedOptions {
  key?: number;
  /** Brightness part: strength on a flat area, and the most it may reach on a busy one (levels). */
  minStrength?: number;
  maxStrength?: number;
  /** Colour part: the blue-yellow (Cb) change, which the eye barely sees (levels). */
  chromaStrength?: number;
}

/**
 * Writes the mark into interleaved 8-bit pixels in place (RGB or RGBA; alpha untouched). The
 * same change is added to R, G and B, so colours do not shift.
 */
export function embedWatermark(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
  payload: WatermarkPayload,
  options: EmbedOptions = {},
): void {
  const key = options.key ?? DEFAULT_KEY;
  const minStrength = options.minStrength ?? 0.5;
  const maxStrength = options.maxStrength ?? 6;
  const chromaStrength = options.chromaStrength ?? 3;
  const bits = payloadBits(payload);
  const cell = width / WATERMARK_COLS;
  const rows = Math.floor(height / cell);
  if (rows < 1 || cell < CHIPS * 2) return;

  // Masking: how much fine detail there is around each pixel (mean absolute high-pass).
  const luma = lumaOf(data, width, height, channels);
  const radius = Math.max(1, Math.round(cell / CHIPS / 2));
  const blurred = boxBlur(luma, width, height, radius);
  const detail = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i++) detail[i] = Math.abs(luma[i]! - blurred[i]!);
  const activity = boxBlur(detail, width, height, Math.max(2, Math.round(cell / 2)));

  const t = tablesFor(key, rows);
  const chip = cell / CHIPS;
  const yEnd = Math.min(height, Math.floor(rows * cell));
  const clampChip = (n: number) => (n < 0 ? 0 : n > CHIPS - 1 ? CHIPS - 1 : n);
  for (let y = 0; y < yEnd; y++) {
    const row = Math.min(rows - 1, Math.floor(y / cell));
    const v = y / chip;
    const b = clampChip(Math.floor(v) - row * CHIPS);
    const wy = Math.sin(Math.PI * (v - Math.floor(v)));
    for (let x = 0; x < width; x++) {
      const col = Math.min(WATERMARK_COLS - 1, Math.floor(x / cell));
      const u = x / chip;
      const a = clampChip(Math.floor(u) - col * CHIPS);
      const wx = Math.sin(Math.PI * (u - Math.floor(u)));
      const c = row * WATERMARK_COLS + col;
      const bit = bits[t.bit[c]!]! ? 1 : -1;
      const i = y * width + x;
      // Hidden by texture: flat areas (sky, plain fabric) get almost nothing; very dark or very
      // bright areas, where the eye sees small steps most easily, get less still.
      const l = luma[i]!;
      const tone = l < 60 ? 0.35 + (0.65 * l) / 60 : l > 225 ? 0.5 : 1;
      const strength = Math.min(maxStrength, (minStrength + 0.6 * Math.max(0, activity[i]! - 1.5)) * tone);
      const pattern = bit * t.sign[c * CHIPS * CHIPS + b * CHIPS + a]! * wx * wy;
      const dy = strength * pattern;
      // Cb up by dc at constant Y and Cr: green down a little, blue up (JPEG's YCbCr matrix).
      const dc = chromaStrength * pattern * (l < 30 ? l / 30 : 1);
      const p = i * channels;
      const add = (ch: number, d: number) => {
        const value = data[p + ch]! + d;
        data[p + ch] = value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
      };
      add(0, dy);
      add(1, dy - 0.344 * dc);
      add(2, dy + 1.772 * dc);
    }
  }
}

/**
 * Fine detail of the picture (luma minus its local average, one blob wide), divided by the local
 * contrast: strong edges such as embroidery would otherwise drown the faint mark in their area.
 */
function highPass(luma: Float32Array, width: number, height: number, cellGuess: number): Float32Array {
  const blurred = boxBlur(luma, width, height, Math.max(1, Math.round(cellGuess / CHIPS / 2)));
  const hp = new Float32Array(luma.length);
  const mag = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i++) {
    hp[i] = luma[i]! - blurred[i]!;
    mag[i] = Math.abs(hp[i]!);
  }
  const contrast = boxBlur(mag, width, height, Math.max(2, Math.round(cellGuess / CHIPS)));
  for (let i = 0; i < hp.length; i++) hp[i] = hp[i]! / (contrast[i]! + 1.5);
  return hp;
}

const sample = (hp: Float32Array, width: number, height: number, x: number, y: number): number => {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) return 0;
  return hp[yi * width + xi]!;
};

/** Soft votes per bit for one placement of the grid: the cell size and where its corner sits. */
function votes(
  hp: Float32Array,
  width: number,
  height: number,
  cell: number,
  ox: number,
  oy: number,
  t: Tables,
  fine: boolean,
): Float64Array {
  const score = new Float64Array(PAYLOAD_BITS);
  const chip = cell / CHIPS;
  // Coarse: each blob's centre; fine: a 3×3 window over the blob, weighted like the blob.
  const offsets = fine ? [0.25, 0.5, 0.75] : [0.5];
  const weights = fine ? [0.7, 1, 0.7] : [1];
  for (let row = 0; row < t.rows; row++) {
    const top = oy + row * cell;
    if (top + cell > height + cell * 0.25) break;
    if (top + cell < 0) continue;
    for (let col = 0; col < WATERMARK_COLS; col++) {
      const left = ox + col * cell;
      const c = row * WATERMARK_COLS + col;
      let corr = 0;
      for (let b = 0; b < CHIPS; b++) {
        for (let a = 0; a < CHIPS; a++) {
          let sum = 0;
          for (let j = 0; j < offsets.length; j++) {
            for (let k = 0; k < offsets.length; k++) {
              sum += weights[j]! * weights[k]! * sample(hp, width, height, left + (a + offsets[k]!) * chip, top + (b + offsets[j]!) * chip);
            }
          }
          corr += t.sign[c * CHIPS * CHIPS + b * CHIPS + a]! * sum;
        }
      }
      const bit = t.bit[c]!;
      score[bit] = score[bit]! + corr;
    }
  }
  return score;
}

const energy = (score: Float64Array) => score.reduce((n, s) => n + Math.abs(s), 0);
const decode = (score: Float64Array) => readPayload(Array.from(score, (s) => (s > 0 ? 1 : 0)));

/**
 * Search grid, tuned on real catalog photos (rough screenshot crops, a Retina screenshot, a 15% cut):
 * scale step, position step as a share of one blob, and how many placements are refined. All 21
 * test cases read correctly in about 2 s at 640px wide.
 */
const SEARCH = { scaleStep: 0.02, offsetStep: 0.5, candidates: 12 };
/** Below this size there is not enough picture to carry the mark. */
const MIN_READ_SIDE = 120;

export interface DetectOptions {
  key?: number;
  /** Search over scale and position (for screenshots); off reads only the exact grid. */
  search?: boolean;
}

export interface Detection {
  payload: WatermarkPayload;
  /** How clearly the bits stood out (0..1): the share of bits whose vote was not close to zero. */
  confidence: number;
}

/**
 * Reads the mark from 8-bit luma (any size). Returns null when there is no readable mark.
 * Pass the picture at a modest size (about 600px wide is plenty): the search is coarse first,
 * then refined around the best placements.
 */
export function detectWatermark(luma: Float32Array, width: number, height: number, options: DetectOptions = {}): Detection | null {
  const key = options.key ?? DEFAULT_KEY;
  if (width < MIN_READ_SIDE || height < MIN_READ_SIDE) return null;
  const baseCell = width / WATERMARK_COLS;
  const hp = highPass(luma, width, height, baseCell);
  // Enough rows for the smallest cell the search tries, plus the rows above a negative offset.
  const t = tablesFor(key, Math.ceil(height / (baseCell * 0.8)) + 4);
  const result = (score: Float64Array): Detection | null => {
    const payload = decode(score);
    if (!payload) return null;
    const mean = energy(score) / PAYLOAD_BITS;
    const clear = Array.from(score).filter((s) => Math.abs(s) > mean * 0.25).length / PAYLOAD_BITS;
    return { payload, confidence: Math.round(clear * 100) / 100 };
  };

  // The image exactly as published (a saved file, not a screenshot).
  const exact = result(votes(hp, width, height, baseCell, 0, 0, t, true));
  if (exact || options.search === false) return exact;

  // Coarse search: the photo filled 80–120% of the width, its corner within ±10% of the frame.
  type Candidate = { cell: number; ox: number; oy: number; e: number };
  const top: Candidate[] = [];
  const keep = SEARCH.candidates;
  const range = width * 0.1;
  for (let s = 0.8; s <= 1.2001; s += SEARCH.scaleStep) {
    const cell = baseCell * s;
    const step = (cell / CHIPS) * SEARCH.offsetStep;
    for (let oy = -range; oy <= range; oy += step) {
      for (let ox = -range; ox <= range; ox += step) {
        const e = energy(votes(hp, width, height, cell, ox, oy, t, false));
        if (top.length < keep || e > top[top.length - 1]!.e) {
          top.push({ cell, ox, oy, e });
          top.sort((p, q) => q.e - p.e);
          if (top.length > keep) top.pop();
        }
      }
    }
  }
  // Refine each candidate on a finer grid and decode.
  for (const c of top) {
    let best = c;
    let bestE = -1;
    const step = ((c.cell / CHIPS) * SEARCH.offsetStep) / 3;
    const half = SEARCH.scaleStep / 2;
    for (let ds = -half; ds <= half + 1e-9; ds += half / 3) {
      const cell = c.cell * (1 + ds);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          // Cheap scoring while refining; the full 3×3 sampling only for the final read.
          const e = energy(votes(hp, width, height, cell, c.ox + dx * step, c.oy + dy * step, t, true));
          if (e > bestE) {
            bestE = e;
            best = { cell, ox: c.ox + dx * step, oy: c.oy + dy * step, e };
          }
        }
      }
    }
    const found = result(votes(hp, width, height, best.cell, best.ox, best.oy, t, true));
    if (found) return found;
  }
  return null;
}
