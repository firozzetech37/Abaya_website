import type { ProductionStage } from '@abaya/contracts';

export type Channel = 'EMAIL' | 'WHATSAPP' | 'PUSH';

/**
 * Retry schedule for the outbox: after attempt n fails, wait RETRY_DELAYS_MS[n-1].
 * Six attempts cover roughly nine hours of provider outage.
 */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Next attempt time after `attempts` failures, or null when we should give up. */
export function nextAttemptAfterFailure(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[Math.max(0, attempts - 1)] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
  return new Date(now.getTime() + delay);
}

/**
 * Customer-facing stages. Workshop-internal steps (finishing, holds, QC sending work back)
 * are not announced; the order page still shows where the abaya is.
 */
const CUSTOMER_STAGES: ProductionStage[] = [
  'SPEC_APPROVED',
  'PATTERN',
  'CUTTING',
  'STITCHING',
  'QC',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REMAKE',
];

/**
 * WhatsApp messages cost money and are read closely, so only milestones go
 * there; push and email carry every customer-facing step.
 */
const WHATSAPP_STAGES: ProductionStage[] = ['PATTERN', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REMAKE'];

export function customerChannelsForStage(from: ProductionStage | null, to: ProductionStage): Channel[] {
  // QC sending work back, and an item resuming after a query, are internal.
  if (from === 'QC' && to !== 'FINISHING' && to !== 'CANCELLED') return [];
  if (from === 'ON_HOLD' && to !== 'CANCELLED') return [];
  if (!CUSTOMER_STAGES.includes(to)) return [];
  return WHATSAPP_STAGES.includes(to) ? ['EMAIL', 'WHATSAPP', 'PUSH'] : ['EMAIL', 'PUSH'];
}

/** Indian mobile number → 10 digits, or null. Accepts "+91 98765 43210", "919876543210", "09876543210". */
export function indianMobileDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
