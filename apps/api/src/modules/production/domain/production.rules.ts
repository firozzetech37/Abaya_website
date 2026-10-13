import type { ProductionStage, SelectedOptionDto, TechPackContent } from '@abaya/contracts';
import { BusinessRuleError } from '../../../common/errors/domain-error';

/** Default QC checklist shown in the admin panel; checked against the tech pack. */
export const DEFAULT_QC_CHECKLIST = [
  'Full length within ±1 cm',
  'Sleeve length within ±1 cm',
  'Bust and shoulder fit the measurements',
  'Fabric and colour match the order',
  'Embellishment and closure as ordered',
  'Seams finished, no loose threads',
  'Pressed and clean',
] as const;

export interface QcInput {
  result: 'PASS' | 'FAIL';
  checklist: { item: string; ok: boolean }[];
  notes?: string;
}

/**
 * QC is recorded only while the item is in QC. A PASS needs every checklist
 * line ticked; a FAIL needs notes (they go back to the tailor with the item).
 */
export function assertQcAllowed(stage: ProductionStage, qc: QcInput, lastResult: 'PASS' | 'FAIL' | null = null): void {
  if (stage !== 'QC') throw new BusinessRuleError('NOT_IN_QC', 'Move the item to quality check first.');
  // A pass moves the item on to finishing; a second pass here would duplicate the tailor payout.
  if (lastResult === 'PASS') {
    throw new BusinessRuleError('QC_ALREADY_PASSED', 'This item already passed quality check.');
  }
  if (qc.result === 'PASS' && qc.checklist.some((c) => !c.ok)) {
    throw new BusinessRuleError('CHECKLIST_INCOMPLETE', 'Every checklist line must pass, or record a fail.');
  }
  if (qc.result === 'FAIL' && !qc.notes?.trim()) {
    throw new BusinessRuleError('NOTES_REQUIRED', 'Explain what the tailor must fix.');
  }
}

/** Tech packs are edited until approved; approval moves the item PLACED → SPEC_APPROVED. */
export function assertTechPackEditable(stage: ProductionStage, alreadyApproved: boolean): void {
  if (alreadyApproved) throw new BusinessRuleError('TECH_PACK_APPROVED', 'This tech pack is already approved.');
  if (stage !== 'PLACED') throw new BusinessRuleError('NOT_PLACED', 'Tech packs are prepared before production starts.');
}

/** A tailor can be picked (or changed) from tech-pack approval until the item is stitched. */
/** The tailor is part of the team picked before the tech pack is approved, and can change until stitched. */
const ASSIGNABLE_STAGES: ProductionStage[] = ['PLACED', 'SPEC_APPROVED', 'PATTERN', 'CUTTING', 'STITCHING', 'ON_HOLD', 'REMAKE'];

export function assertAssignable(input: { stage: ProductionStage; makerActive: boolean; dueDate: Date; now?: Date }): void {
  if (!ASSIGNABLE_STAGES.includes(input.stage)) {
    throw new BusinessRuleError('ALREADY_STITCHED', 'This item has already been stitched.');
  }
  if (!input.makerActive) throw new BusinessRuleError('MAKER_INACTIVE', 'This tailor is not active.');
  if (input.dueDate.getTime() <= (input.now ?? new Date()).getTime()) {
    throw new BusinessRuleError('DUE_DATE_PAST', 'The due date must be in the future.');
  }
}

/** Only packed items whose most recent QC check passed may ship. */
export function assertReadyToShip(stage: ProductionStage, lastQcResult: 'PASS' | 'FAIL' | null): void {
  if (stage !== 'PACKED' || lastQcResult !== 'PASS') {
    throw new BusinessRuleError('NOT_READY_TO_SHIP', 'Only items that passed quality check and are packed can ship.');
  }
}

const optionFor = (options: SelectedOptionDto[], group: string) =>
  options.filter((o) => o.groupCode === group).map((o) => o.valueName).join(', ');

/** Size-band garment chart (cm) used when the customer ordered a standard size. */
const SIZE_CHART: Record<string, Record<string, number>> = {
  XS: { bustCm: 82, shoulderCm: 36, sleeveLengthCm: 56, fullLengthCm: 132 },
  S: { bustCm: 87, shoulderCm: 37, sleeveLengthCm: 57, fullLengthCm: 135 },
  M: { bustCm: 94, shoulderCm: 38.5, sleeveLengthCm: 58, fullLengthCm: 138 },
  L: { bustCm: 101, shoulderCm: 40, sleeveLengthCm: 59, fullLengthCm: 140 },
  XL: { bustCm: 108, shoulderCm: 41.5, sleeveLengthCm: 60, fullLengthCm: 142 },
  XXL: { bustCm: 116, shoulderCm: 43, sleeveLengthCm: 61, fullLengthCm: 144 },
};

/** A first draft of the tech pack from the order snapshot; production edits and approves it. */
export function draftTechPack(item: {
  style: string;
  options: SelectedOptionDto[];
  sizeBandCode: string;
  measurements: Record<string, number | string | null> | null;
}): TechPackContent {
  const measurements: Record<string, number> = {};
  if (item.measurements) {
    for (const [k, v] of Object.entries(item.measurements)) {
      if (k.endsWith('Cm') && typeof v === 'number') measurements[k] = v;
    }
  } else {
    Object.assign(measurements, SIZE_CHART[item.sizeBandCode] ?? {});
  }
  const customerNotes = typeof item.measurements?.notes === 'string' ? item.measurements.notes : '';
  return {
    style: item.style,
    fabric: optionFor(item.options, 'FABRIC'),
    colour: optionFor(item.options, 'COLOUR'),
    patternColour: optionFor(item.options, 'PATTERN_COLOUR'),
    sleeve: optionFor(item.options, 'SLEEVE'),
    closure: optionFor(item.options, 'CLOSURE'),
    embellishments: optionFor(item.options, 'EMBELLISHMENT'),
    addOns: optionFor(item.options, 'ADD_ON'),
    measurements,
    constructionNotes: customerNotes ? `Customer note: ${customerNotes}` : '',
    referenceImagePaths: [],
  };
}
