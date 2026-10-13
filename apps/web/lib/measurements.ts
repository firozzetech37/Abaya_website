import { type MeasurementBody, measurementBody, type MeasurementProfileDto } from '@abaya/contracts';
import type { MeasureField } from '@/components/account/measurement-diagram';
import type { Selections } from './redesign';

/** Field order shared by the guided form and the product-page form. */
export const MEASURE_FIELDS: { key: MeasureField; optional?: boolean }[] = [
  { key: 'heightCm' },
  { key: 'fullLengthCm' },
  { key: 'shoulderCm' },
  { key: 'bustCm' },
  { key: 'waistCm' },
  { key: 'hipCm' },
  { key: 'sleeveLengthCm' },
  { key: 'wristCm', optional: true },
];

/** The allowed range, read from the shared Zod schema so hints never drift from validation. */
export function rangeOf(key: MeasureField): { min: number; max: number } {
  let schema = measurementBody.shape[key] as unknown as {
    _def: { checks?: { kind: string; value: number }[]; innerType?: unknown };
  };
  // Unwrap ZodOptional to reach the ZodNumber checks.
  if (schema._def.innerType) schema = schema._def.innerType as typeof schema;
  const checks = schema._def.checks ?? [];
  return {
    min: checks.find((c) => c.kind === 'min')?.value ?? 0,
    max: checks.find((c) => c.kind === 'max')?.value ?? 300,
  };
}

/** An empty box must become "missing", not 0. */
export const toNumber = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v));

/** What the form holds before the customer types anything. */
export const blankMeasurements = (): Partial<MeasurementBody> => ({ name: 'Me', notes: '', isDefault: false });

/** A saved profile as form values. */
export function profileToValues(p: MeasurementProfileDto): MeasurementBody {
  return {
    name: p.name,
    heightCm: p.heightCm,
    bustCm: p.bustCm,
    waistCm: p.waistCm,
    hipCm: p.hipCm,
    shoulderCm: p.shoulderCm,
    sleeveLengthCm: p.sleeveLengthCm,
    fullLengthCm: p.fullLengthCm,
    wristCm: p.wristCm ?? undefined,
    notes: p.notes ?? '',
    isDefault: p.isDefault,
  };
}

/** True when the typed values match the saved profile, so it can be reused without a save. */
export function sameMeasurements(values: MeasurementBody, p: MeasurementProfileDto): boolean {
  const numbers: (keyof MeasurementProfileDto & keyof MeasurementBody)[] = [
    'heightCm',
    'bustCm',
    'waistCm',
    'hipCm',
    'shoulderCm',
    'sleeveLengthCm',
    'fullLengthCm',
  ];
  return (
    numbers.every((k) => values[k] === p[k]) &&
    (values.wristCm ?? null) === p.wristCm &&
    values.name.trim() === p.name &&
    (values.notes?.trim() || null) === p.notes
  );
}

// ───────────── Draft that survives the login round-trip ─────────────

/**
 * Everything the customer chose on a design page, kept in this tab's sessionStorage while
 * they log in, then restored once. Never sent anywhere.
 */
export interface RedesignDraft {
  /** "shown": ordered exactly as photographed (default options); "custom": the customer changed things. */
  mode?: 'shown' | 'custom';
  selections: Selections;
  sizeMode: 'band' | 'profile';
  sizeBandId: string | null;
  /** Saved profile being edited, null for "new measurements". */
  editingId: string | null;
  measurements: Partial<MeasurementBody>;
}

const draftKey = (designId: string) => `abaya:redesign:${designId}`;
// A stable snapshot per design, so useSyncExternalStore sees one object, not a new parse each render.
const drafts = new Map<string, RedesignDraft | null>();

export function saveDraft(designId: string, draft: RedesignDraft): void {
  try {
    sessionStorage.setItem(draftKey(designId), JSON.stringify(draft));
  } catch {
    // Private mode or storage blocked: the customer just re-enters their choices.
  }
  drafts.set(designId, draft);
}

/** The draft for this design, read once per page and then served from memory. */
export function readDraft(designId: string): RedesignDraft | null {
  const cached = drafts.get(designId);
  if (cached !== undefined) return cached;
  let draft: RedesignDraft | null = null;
  try {
    const raw = sessionStorage.getItem(draftKey(designId));
    draft = raw ? (JSON.parse(raw) as RedesignDraft) : null;
  } catch {
    draft = null;
  }
  drafts.set(designId, draft);
  return draft;
}

/**
 * Forget the draft after it has done its job (the item is in the bag). Only the storage is
 * cleared: the in-memory snapshot stays stable so the mounted panel is never remounted.
 */
export function forgetDraft(designId: string): void {
  try {
    sessionStorage.removeItem(draftKey(designId));
  } catch {
    // ignore
  }
}
