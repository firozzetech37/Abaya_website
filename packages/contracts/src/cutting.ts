/**
 * Cutting station (docs/apps/workshop.md): what was cut, from which fabric roll, how much
 * fabric it took against the pattern's estimate. Shared by the API and the workshop screens.
 */
import { z } from 'zod';

/** Using more than this share over the pattern's fabric estimate needs a note. */
export const FABRIC_OVERUSE_THRESHOLD = 0.15;

/** Percent over (+) or under (−) the estimate, rounded; null without an estimate. */
export function fabricVariancePercent(usedCm: number, estimateCm: number | null): number | null {
  if (!estimateCm || estimateCm <= 0) return null;
  return Math.round(((usedCm - estimateCm) / estimateCm) * 100);
}

/** Whole-number maths, so exactly +15% is not "over" because of floating-point rounding. */
export const isFabricOveruse = (usedCm: number, estimateCm: number | null): boolean =>
  estimateCm !== null && estimateCm > 0 && usedCm * 100 > estimateCm * (100 + Math.round(FABRIC_OVERUSE_THRESHOLD * 100));

/** POST /v1/workshop/items/:id/cutting: cutting done, with the cut-pieces photo. */
export const cuttingBody = z.object({
  fabricLot: z.string().trim().min(1, 'Enter the fabric lot or roll number').max(60),
  colourConfirmed: z.boolean(),
  fabricUsedCm: z.number().int().min(1).max(3000),
  wastageCm: z.number().int().min(0).max(3000).nullable(),
  liningUsedCm: z.number().int().min(0).max(3000).nullable(),
  /** The pattern's pieces, each ticked when cut. */
  pieces: z
    .array(z.object({ name: z.string().min(1).max(60), count: z.number().int().min(1).max(20), cut: z.boolean() }))
    .max(40),
  notes: z.string().max(1000),
  /** From POST /v1/workshop/uploads (STAGE_PHOTO). */
  photoPath: z.string().min(1).max(300),
});
export type CuttingBody = z.infer<typeof cuttingBody>;

export type CuttingGap = 'lot' | 'colour' | 'fabric' | 'pieces' | 'overuseNote' | 'photo';

/**
 * What still stops the item going to stitching (empty: ready). Every pattern piece must be
 * ticked; heavy over-use against the estimate needs a note.
 */
export function missingForStitching(
  body: Omit<CuttingBody, 'photoPath'> & { photoPath: string | null },
  pattern: { pieces: { name: string; count: number }[]; fabricLengthCm: number | null },
): CuttingGap[] {
  const gaps: CuttingGap[] = [];
  if (!body.fabricLot.trim()) gaps.push('lot');
  if (!body.colourConfirmed) gaps.push('colour');
  if (!body.fabricUsedCm || body.fabricUsedCm <= 0) gaps.push('fabric');
  const cut = new Set(body.pieces.filter((p) => p.cut).map((p) => p.name));
  if (pattern.pieces.some((p) => !cut.has(p.name))) gaps.push('pieces');
  if (body.fabricUsedCm > 0 && isFabricOveruse(body.fabricUsedCm, pattern.fabricLengthCm) && !body.notes.trim()) gaps.push('overuseNote');
  if (!body.photoPath) gaps.push('photo');
  return gaps;
}
