import {
  type AbayaStyle,
  DEFAULT_EASE_CM,
  defaultPieces,
  finishedCm,
  missingForCutting,
  type OptionGroupCode,
  PATTERN_POINTS,
  type PatternBody,
  type PatternMeasurementDto,
  type ProductionStage,
  type Role,
} from '@abaya/contracts';
import { BusinessRuleError } from '../../../common/errors/domain-error';

/**
 * Pattern station rules (docs/apps/workshop.md). Plain TypeScript.
 * The pattern is edited while the item is at PATTERN, by the technician who took the job
 * (or a production manager); it must be complete before the item goes to cutting.
 */

const isManager = (roles: readonly Role[]) => roles.includes('SUPER_ADMIN') || roles.includes('PRODUCTION_MANAGER');

export function mayEditPattern(input: { stage: ProductionStage; roles: readonly Role[]; claimedById: string | null; actorId: string }): boolean {
  if (input.stage !== 'PATTERN') return false;
  if (isManager(input.roles)) return true;
  return input.roles.includes('PATTERN_TECHNICIAN') && input.claimedById === input.actorId;
}

export function assertReadyForCutting(content: PatternBody | null): void {
  if (!content) throw new BusinessRuleError('PATTERN_MISSING', 'Save the pattern first.');
  const missing = missingForCutting(content);
  if (missing.length > 0) {
    throw new BusinessRuleError('PATTERN_INCOMPLETE', `The pattern still needs: ${missing.join(', ')}.`, { missing });
  }
}

/** Body measurements the pattern starts from: the approved tech pack's, else the order's. */
export function bodyMeasurements(
  techPackMeasurements: Record<string, number> | null,
  orderMeasurements: Record<string, number | string | null> | null,
): Partial<Record<(typeof PATTERN_POINTS)[number], number>> {
  const out: Partial<Record<(typeof PATTERN_POINTS)[number], number>> = {};
  for (const key of PATTERN_POINTS) {
    const fromPack = techPackMeasurements?.[key];
    const fromOrder = orderMeasurements?.[key];
    const value = typeof fromPack === 'number' ? fromPack : typeof fromOrder === 'number' ? fromOrder : undefined;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export const withFinished = (rows: PatternBody['measurements']): PatternMeasurementDto[] =>
  rows.map((m) => ({ ...m, finishedCm: m.bodyCm === null ? null : finishedCm(m.bodyCm, m.easeCm) }));

/** Prefill for a first pattern: every point, default ease for the style, pieces from the options. */
export function suggestPattern(input: {
  style: AbayaStyle;
  body: Partial<Record<(typeof PATTERN_POINTS)[number], number>>;
  options: { groupCode: OptionGroupCode; valueName: string }[];
}): { measurements: PatternMeasurementDto[]; pieces: { name: string; count: number }[] } {
  const ease = DEFAULT_EASE_CM[input.style];
  return {
    measurements: withFinished(PATTERN_POINTS.map((key) => ({ key, bodyCm: input.body[key] ?? null, easeCm: ease[key] }))),
    pieces: defaultPieces(input.style, input.options),
  };
}
