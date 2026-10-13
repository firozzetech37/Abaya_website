/**
 * Allowed status transitions, shared by the API (enforcement) and the UIs
 * (which buttons to show). Role checks live in the API use cases.
 * Rules: docs/domain-model.md §2 and §5.
 */
import type { DesignStatus, ProductionStage, ReferenceStatus } from './enums';

export const DESIGN_TRANSITIONS: Record<DesignStatus, readonly DesignStatus[]> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['CHANGES_REQUESTED', 'PRICED'],
  CHANGES_REQUESTED: ['IN_REVIEW'],
  PRICED: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED', 'PRICED'],
  ARCHIVED: ['PUBLISHED'],
};

export const REFERENCE_TRANSITIONS: Record<ReferenceStatus, readonly ReferenceStatus[]> = {
  IMPORTED: ['IN_REVIEW', 'REJECTED'],
  IN_REVIEW: ['NEEDS_DESIGN', 'REJECTED'],
  NEEDS_DESIGN: ['DESIGNED', 'REJECTED'],
  DESIGNED: [],
  REJECTED: [],
};

/**
 * Production flow through the workshop stations (docs/domain-model.md §5):
 * SPEC_APPROVED → PATTERN → CUTTING → STITCHING → QC → FINISHING → PACKED → SHIPPED → DELIVERED.
 * Backward moves: QC fail → the stage that caused it; ON_HOLD → back to where it was held.
 */
export const PRODUCTION_TRANSITIONS: Record<ProductionStage, readonly ProductionStage[]> = {
  PLACED: ['SPEC_APPROVED', 'CANCELLED'],
  SPEC_APPROVED: ['PATTERN', 'ON_HOLD', 'CANCELLED'],
  PATTERN: ['CUTTING', 'ON_HOLD', 'CANCELLED'],
  CUTTING: ['STITCHING', 'ON_HOLD', 'CANCELLED'],
  STITCHING: ['QC', 'ON_HOLD', 'CANCELLED'], // hold: the tailor reports a problem with the cut kit
  QC: ['FINISHING', 'STITCHING', 'CUTTING', 'PATTERN', 'CANCELLED'], // pass → FINISHING, fail → back
  FINISHING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REMAKE'],
  REMAKE: ['PATTERN', 'CUTTING'],
  // Resume: back to the held stage. A stitching problem may instead go back to cutting (re-cut).
  ON_HOLD: ['SPEC_APPROVED', 'PATTERN', 'CUTTING', 'STITCHING', 'CANCELLED'],
  CANCELLED: [],
  ASSIGNED: ['PATTERN', 'CANCELLED'], // old flow; migrated to PATTERN
};

/** Where QC can send a failed item back to. */
export const QC_SEND_BACK_STAGES = ['STITCHING', 'CUTTING', 'PATTERN'] as const;

export const canTransitionDesign = (from: DesignStatus, to: DesignStatus): boolean =>
  DESIGN_TRANSITIONS[from].includes(to);

export const canTransitionReference = (from: ReferenceStatus, to: ReferenceStatus): boolean =>
  REFERENCE_TRANSITIONS[from].includes(to);

export const canTransitionStage = (from: ProductionStage, to: ProductionStage): boolean =>
  PRODUCTION_TRANSITIONS[from].includes(to);

/** Stages that count as "being made" for maker capacity (assigned tailors). */
export const ACTIVE_PRODUCTION_STAGES: readonly ProductionStage[] = [
  'SPEC_APPROVED',
  'PATTERN',
  'CUTTING',
  'STITCHING',
  'QC',
  'ON_HOLD',
  'REMAKE',
];
