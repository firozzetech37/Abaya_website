import { BusinessRuleError } from '../../../common/errors/domain-error';

export const MAX_MEASUREMENT_PROFILES = 10;
export const MAX_CART_ITEMS = 20;
export const MAX_WISHLIST_ITEMS = 200;

/** Fields copied into OrderItem.measurementsSnapshot at checkout (centimetres). */
export interface MeasurementValues {
  heightCm: number;
  bustCm: number;
  waistCm: number;
  hipCm: number;
  shoulderCm: number;
  sleeveLengthCm: number;
  fullLengthCm: number;
  wristCm: number | null;
}

export type MeasurementSnapshot = MeasurementValues & {
  profileId: string;
  profileName: string;
  notes: string | null;
  capturedAt: string;
};

export function measurementSnapshot(
  profile: MeasurementValues & { id: string; name: string; notes: string | null },
  now = new Date(),
): MeasurementSnapshot {
  return {
    profileId: profile.id,
    profileName: profile.name,
    heightCm: profile.heightCm,
    bustCm: profile.bustCm,
    waistCm: profile.waistCm,
    hipCm: profile.hipCm,
    shoulderCm: profile.shoulderCm,
    sleeveLengthCm: profile.sleeveLengthCm,
    fullLengthCm: profile.fullLengthCm,
    wristCm: profile.wristCm,
    notes: profile.notes,
    capturedAt: now.toISOString(),
  };
}

/**
 * Cross-field check beyond the per-field ranges in @abaya/contracts: shoulder
 * to floor can never exceed the wearer's height, so that is always a typo.
 */
export function assertPlausibleMeasurements(m: Pick<MeasurementValues, 'heightCm' | 'fullLengthCm'>): void {
  if (m.fullLengthCm >= m.heightCm) {
    throw new BusinessRuleError(
      'MEASUREMENTS_IMPLAUSIBLE',
      'Full length (shoulder to floor) must be less than your height.',
      { field: 'fullLengthCm' },
    );
  }
}

export function assertLimit(count: number, max: number, what: string): void {
  if (count >= max) throw new BusinessRuleError('LIMIT_REACHED', `You can save up to ${max} ${what}.`);
}
