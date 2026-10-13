/**
 * Stitching station (docs/apps/workshop.md): the tailor's checklist built from the tech pack
 * and pattern, a measurement self-check against the pattern's finished sizes, and problem
 * reports about the cut kit. Shared by the API and the workshop screens.
 */
import { z } from 'zod';

/** Finished-garment points the tailor measures before sending to QC. */
export const SELF_CHECK_POINTS = ['fullLengthCm', 'bustCm', 'sleeveLengthCm'] as const;
export type SelfCheckPoint = (typeof SELF_CHECK_POINTS)[number];

/** Off by more than this (cm): a warning. More than NOTE_CM: a note is required. */
export const SELF_CHECK_WARN_CM = 1;
export const SELF_CHECK_NOTE_CM = 2;

export const STITCHING_PROBLEM_TYPES = ['MISSING_PIECE', 'WRONG_SIZE', 'FABRIC_FLAW', 'OTHER'] as const;
export type StitchingProblemType = (typeof STITCHING_PROBLEM_TYPES)[number];

/** How a problem is written into the job's history (the hold note). */
export const STITCHING_PROBLEM_LABELS: Record<StitchingProblemType, string> = {
  MISSING_PIECE: 'Missing piece',
  WRONG_SIZE: 'Wrong size',
  FABRIC_FLAW: 'Fabric flaw',
  OTHER: 'Problem',
};

export interface ChecklistLine {
  key: string;
  label: string;
}

const splitList = (text: string | null | undefined) =>
  (text ?? '')
    .split(/,|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The tailor's checklist: assembly, sleeves (and cuffs), the closure, one line per
 * embellishment and add-on, and the hem at the finished length.
 */
export function stitchingChecklist(input: {
  techPack: { closure?: string; embellishments?: string; addOns?: string } | null;
  pieces: { name: string }[];
  finishedLengthCm: number | null;
}): ChecklistLine[] {
  const lines: ChecklistLine[] = [{ key: 'assembly', label: 'Body assembled, seams finished' }];
  const names = input.pieces.map((p) => p.name.toLowerCase());
  if (names.some((n) => n.includes('sleeve'))) lines.push({ key: 'sleeves', label: 'Sleeves attached' });
  if (names.some((n) => n.includes('cuff'))) lines.push({ key: 'cuffs', label: 'Cuffs attached' });
  const closure = input.techPack?.closure?.trim();
  if (closure) lines.push({ key: 'closure', label: `Closure: ${closure}` });
  for (const e of splitList(input.techPack?.embellishments)) lines.push({ key: `emb-${slug(e)}`, label: e });
  for (const a of splitList(input.techPack?.addOns)) lines.push({ key: `add-${slug(a)}`, label: a });
  lines.push({
    key: 'hem',
    label: input.finishedLengthCm ? `Hem finished at ${input.finishedLengthCm} cm` : 'Hem finished',
  });
  // Keys must be unique even if two embellishments slug the same way.
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const n = (seen.get(l.key) ?? 0) + 1;
    seen.set(l.key, n);
    return n === 1 ? l : { ...l, key: `${l.key}-${n}` };
  });
}

export type SelfCheckLevel = 'ok' | 'warn' | 'off';

export function selfCheckLevel(measuredCm: number, targetCm: number): SelfCheckLevel {
  const diff = Math.abs(measuredCm - targetCm);
  return diff > SELF_CHECK_NOTE_CM ? 'off' : diff > SELF_CHECK_WARN_CM ? 'warn' : 'ok';
}

/** POST /v1/workshop/items/:id/stitching: stitching done, send to QC. */
export const stitchingBody = z.object({
  checklist: z.array(z.object({ key: z.string().min(1).max(80), done: z.boolean() })).max(40),
  measurements: z.array(z.object({ key: z.enum(SELF_CHECK_POINTS), measuredCm: z.number().min(0).max(300) })).max(3),
  notes: z.string().max(1000),
  /** Finished piece, from POST /v1/workshop/uploads (STAGE_PHOTO). */
  photoPath: z.string().min(1).max(300),
});
export type StitchingBody = z.infer<typeof stitchingBody>;

export type StitchingGap = 'checklist' | 'measurements' | 'offNote' | 'photo';

/** What still stops the piece going to QC (empty: ready). */
export function missingForQc(
  body: Omit<StitchingBody, 'photoPath'> & { photoPath: string | null },
  expected: { checklist: ChecklistLine[]; targets: Partial<Record<SelfCheckPoint, number>> },
): StitchingGap[] {
  const gaps: StitchingGap[] = [];
  const done = new Set(body.checklist.filter((c) => c.done).map((c) => c.key));
  if (expected.checklist.some((l) => !done.has(l.key))) gaps.push('checklist');
  const measured = new Map(body.measurements.map((m) => [m.key, m.measuredCm]));
  const points = SELF_CHECK_POINTS.filter((p) => expected.targets[p] !== undefined);
  if (points.some((p) => !measured.get(p))) gaps.push('measurements');
  const off = points.some((p) => {
    const m = measured.get(p);
    return m !== undefined && m > 0 && selfCheckLevel(m, expected.targets[p]!) === 'off';
  });
  if (off && !body.notes.trim()) gaps.push('offNote');
  if (!body.photoPath) gaps.push('photo');
  return gaps;
}
