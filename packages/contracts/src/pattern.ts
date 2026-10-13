/**
 * Pattern station (docs/apps/workshop.md): body measurements + ease = finished garment
 * sizes, the pieces to cut, the fabric needed and the pattern files. Shared by the API
 * (validation, suggestions) and the workshop screens.
 */
import { z } from 'zod';
import type { AbayaStyle, OptionGroupCode } from './enums';

/** Measurement points a pattern is drafted from (keys match the measurement profile). */
export const PATTERN_POINTS = ['bustCm', 'waistCm', 'hipCm', 'shoulderCm', 'sleeveLengthCm', 'fullLengthCm', 'wristCm'] as const;
export type PatternPoint = (typeof PATTERN_POINTS)[number];

/**
 * Starting ease (cm added to the body measurement) per style. The technician adjusts it
 * per order; these are only the defaults. Full length gets a hem allowance.
 */
export const DEFAULT_EASE_CM: Record<AbayaStyle, Record<PatternPoint, number>> = {
  CLOSED: { bustCm: 12, waistCm: 16, hipCm: 14, shoulderCm: 1, sleeveLengthCm: 1, fullLengthCm: 2, wristCm: 6 },
  OPEN_FRONT: { bustCm: 14, waistCm: 18, hipCm: 16, shoulderCm: 1.5, sleeveLengthCm: 1, fullLengthCm: 2, wristCm: 8 },
  BUTTERFLY: { bustCm: 30, waistCm: 30, hipCm: 30, shoulderCm: 0, sleeveLengthCm: 0, fullLengthCm: 2, wristCm: 0 },
  KIMONO: { bustCm: 20, waistCm: 24, hipCm: 22, shoulderCm: 3, sleeveLengthCm: -2, fullLengthCm: 2, wristCm: 14 },
  BISHT: { bustCm: 24, waistCm: 28, hipCm: 26, shoulderCm: 3, sleeveLengthCm: 0, fullLengthCm: 2, wristCm: 16 },
  KAFTAN: { bustCm: 28, waistCm: 32, hipCm: 30, shoulderCm: 4, sleeveLengthCm: -3, fullLengthCm: 2, wristCm: 16 },
  OTHER: { bustCm: 14, waistCm: 18, hipCm: 16, shoulderCm: 1, sleeveLengthCm: 1, fullLengthCm: 2, wristCm: 8 },
};

/** Fabric widths the workshop buys (cm). Other widths can be typed in. */
export const FABRIC_WIDTHS_CM = [110, 140, 150] as const;

/** Files a pattern may carry: CAD exports and PDFs, or photos of a paper pattern. */
export const PATTERN_FILE_TYPES = ['application/pdf', 'application/dxf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type PatternFileType = (typeof PATTERN_FILE_TYPES)[number];

/** Pieces every style starts with; options add their own (e.g. a belt, a hijab). */
const BASE_PIECES: Record<AbayaStyle, { name: string; count: number }[]> = {
  CLOSED: [
    { name: 'Front', count: 1 },
    { name: 'Back', count: 1 },
    { name: 'Sleeve', count: 2 },
  ],
  OPEN_FRONT: [
    { name: 'Front panel', count: 2 },
    { name: 'Back', count: 1 },
    { name: 'Sleeve', count: 2 },
    { name: 'Front facing', count: 2 },
  ],
  BUTTERFLY: [
    { name: 'Body (full width)', count: 2 },
    { name: 'Inner lining panel', count: 1 },
  ],
  KIMONO: [
    { name: 'Front panel', count: 2 },
    { name: 'Back', count: 1 },
    { name: 'Kimono sleeve', count: 2 },
    { name: 'Front band', count: 1 },
  ],
  BISHT: [
    { name: 'Front panel', count: 2 },
    { name: 'Back', count: 1 },
    { name: 'Sleeve', count: 2 },
    { name: 'Edge trim strip', count: 2 },
  ],
  KAFTAN: [
    { name: 'Front', count: 1 },
    { name: 'Back', count: 1 },
    { name: 'Neck facing', count: 1 },
  ],
  OTHER: [
    { name: 'Front', count: 1 },
    { name: 'Back', count: 1 },
    { name: 'Sleeve', count: 2 },
  ],
};

/** Starting piece list from the style and the chosen options (the technician edits it). */
export function defaultPieces(
  style: AbayaStyle,
  options: { groupCode: OptionGroupCode; valueName: string }[],
): { name: string; count: number }[] {
  const pieces = BASE_PIECES[style].map((p) => ({ ...p }));
  const has = (re: RegExp) => options.some((o) => re.test(o.valueName));
  if (options.some((o) => o.groupCode === 'SLEEVE' && /cuff/i.test(o.valueName))) pieces.push({ name: 'Cuff', count: 2 });
  if (options.some((o) => o.groupCode === 'CLOSURE' && /belt/i.test(o.valueName)) || has(/\bbelt/i)) pieces.push({ name: 'Belt', count: 1 });
  for (const o of options.filter((x) => x.groupCode === 'ADD_ON')) {
    if (!pieces.some((p) => p.name.toLowerCase() === o.valueName.toLowerCase())) pieces.push({ name: o.valueName, count: 1 });
  }
  return pieces;
}

/** Finished size = body + ease, to the nearest half centimetre. */
export const finishedCm = (bodyCm: number, easeCm: number): number => Math.round((bodyCm + easeCm) * 2) / 2;

/**
 * Rough fabric length (cm) for one abaya, rounded up to 10 cm. Narrow fabric needs the
 * sleeves cut separately; wide-cut styles (butterfly, kaftan, kimono) need extra width.
 */
export function suggestFabricLengthCm(input: {
  style: AbayaStyle;
  fullLengthCm: number;
  sleeveLengthCm: number;
  fabricWidthCm: number;
}): number {
  const wide = input.style === 'BUTTERFLY' || input.style === 'KAFTAN' || input.style === 'KIMONO';
  const narrow = input.fabricWidthCm < 140;
  let cm = input.fullLengthCm * 2 + 20; // front + back + hems and allowances
  if (input.style !== 'BUTTERFLY') cm += narrow ? input.sleeveLengthCm * 2 : input.sleeveLengthCm;
  if (wide && narrow) cm += input.fullLengthCm; // extra panel for the width
  return Math.ceil(cm / 10) * 10;
}

// ───────────── Request body ─────────────

const measurementRow = z.object({
  key: z.enum(PATTERN_POINTS),
  /** Null when the customer did not give this measurement (the technician may type one). */
  bodyCm: z.number().min(0).max(300).nullable(),
  easeCm: z.number().min(-20).max(80),
});

export const patternFileRef = z.object({
  path: z.string().min(1).max(300), // from POST /v1/workshop/uploads (purpose PATTERN_FILE)
  name: z.string().min(1).max(120),
  contentType: z.enum(PATTERN_FILE_TYPES),
});

/** PUT /v1/workshop/items/:id/pattern: save the pattern draft. */
export const patternBody = z.object({
  measurements: z.array(measurementRow).max(PATTERN_POINTS.length),
  pieces: z
    .array(z.object({ name: z.string().trim().min(1).max(60), count: z.number().int().min(1).max(20) }))
    .max(40),
  fabricWidthCm: z.number().int().min(60).max(330).nullable(),
  fabricLengthCm: z.number().int().min(50).max(2000).nullable(),
  liningLengthCm: z.number().int().min(0).max(2000).nullable(),
  seamAllowanceMm: z.number().int().min(0).max(50),
  notes: z.string().max(2000),
  files: z.array(patternFileRef).max(20),
});
export type PatternBody = z.infer<typeof patternBody>;

/** What still stops a pattern from going to cutting (empty: ready). */
export function missingForCutting(p: PatternBody): ('measurements' | 'pieces' | 'fabric' | 'files')[] {
  const missing: ('measurements' | 'pieces' | 'fabric' | 'files')[] = [];
  const has = (key: PatternPoint) => p.measurements.some((m) => m.key === key && m.bodyCm !== null);
  if (!has('bustCm') || !has('fullLengthCm')) missing.push('measurements');
  if (p.pieces.length === 0) missing.push('pieces');
  if (!p.fabricWidthCm || !p.fabricLengthCm) missing.push('fabric');
  if (p.files.length === 0) missing.push('files');
  return missing;
}
