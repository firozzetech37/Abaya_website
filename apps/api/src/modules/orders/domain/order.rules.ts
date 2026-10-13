import {
  canTransitionStage,
  type OrderStatus,
  PRODUCTION_STAGES,
  type ProductionStage,
  type Role,
} from '@abaya/contracts';
import { BusinessRuleError, ForbiddenError, InvalidTransitionError } from '../../../common/errors/domain-error';

/** "AB-2026-000123" (docs/domain-model.md §5). */
export function formatOrderNumber(year: number, sequence: number): string {
  return `AB-${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * How a move is made. Moves with extra data or rules have a dedicated flow (tech pack
 * approval, QC result, shipping, cancellation, hold/resume); everything else is a
 * plain "generic" step taken by the station that owns it.
 */
export type StageFlow = 'generic' | 'tech-pack' | 'qc' | 'ship' | 'cancel' | 'hold';

export function flowFor(from: ProductionStage, to: ProductionStage): StageFlow {
  if (to === 'CANCELLED') return 'cancel';
  if (to === 'ON_HOLD' || from === 'ON_HOLD') return 'hold';
  if (from === 'PLACED' && to === 'SPEC_APPROVED') return 'tech-pack';
  if (to === 'SHIPPED') return 'ship';
  if (from === 'QC') return 'qc'; // pass → FINISHING, fail → back to a station
  return 'generic';
}

/**
 * Who may take each generic step, by target stage (SUPER_ADMIN always). Each workshop
 * station moves items out of its own stage; tailors are also checked to own the item.
 */
const GENERIC_STAGE_ROLES: Partial<Record<ProductionStage, Role[]>> = {
  PATTERN: ['PRODUCTION_MANAGER', 'PATTERN_TECHNICIAN'], // start the pattern (or restart after a remake)
  CUTTING: ['PRODUCTION_MANAGER', 'PATTERN_TECHNICIAN'], // pattern confirmed
  STITCHING: ['PRODUCTION_MANAGER', 'CUTTER'], // cutting done
  QC: ['PRODUCTION_MANAGER', 'MAKER'], // stitching done
  PACKED: ['PRODUCTION_MANAGER', 'FINISHER'], // finished and packed
  DELIVERED: ['PRODUCTION_MANAGER', 'SUPPORT', 'LOGISTICS'],
  REMAKE: ['PRODUCTION_MANAGER', 'SUPPORT'],
};

/** Who may put an item on hold at (or resume it to) each stage: that station, or the production manager. */
const HOLD_ROLES: Partial<Record<ProductionStage, Role[]>> = {
  SPEC_APPROVED: ['PRODUCTION_MANAGER', 'PATTERN_TECHNICIAN'],
  PATTERN: ['PRODUCTION_MANAGER', 'PATTERN_TECHNICIAN'],
  CUTTING: ['PRODUCTION_MANAGER', 'CUTTER'],
  STITCHING: ['PRODUCTION_MANAGER', 'MAKER'], // the tailor reports a problem with the cut kit
};

/** A stitching problem is decided by the production manager: resume stitching, or re-cut. */
const MANAGER_ONLY: Role[] = ['PRODUCTION_MANAGER'];

export const genericStageRoles = (to: ProductionStage): readonly Role[] => GENERIC_STAGE_ROLES[to] ?? [];

/** Stage photos (private bucket): cut pieces, the stitched piece, the packed parcel. */
export function requiresPhoto(from: ProductionStage, to: ProductionStage): boolean {
  return (
    (from === 'CUTTING' && to === 'STITCHING') || (from === 'STITCHING' && to === 'QC') || (from === 'FINISHING' && to === 'PACKED')
  );
}

export interface StageChangeRequest {
  from: ProductionStage;
  to: ProductionStage;
  flow: StageFlow;
  actorRoles: readonly Role[];
  orderStatus: OrderStatus;
  /** ON_HOLD items: the stage they were held at (the only stage they may resume to). */
  heldFromStage?: ProductionStage | null;
  photoPath?: string;
  note?: string;
}

const hasAny = (roles: readonly Role[], allowed: readonly Role[]) =>
  roles.includes('SUPER_ADMIN') || allowed.some((r) => roles.includes(r));

/**
 * The single rule set behind OrdersService.changeStage. Stages only move forward
 * (PRODUCTION_TRANSITIONS) except QC fail → an earlier station, ON_HOLD and back, and
 * DELIVERED → REMAKE.
 */
export function assertStageChange(req: StageChangeRequest): void {
  if (req.orderStatus !== 'PAID') {
    throw new BusinessRuleError('ORDER_NOT_PAID', 'Production can only change on a paid order.');
  }
  if (!canTransitionStage(req.from, req.to)) throw new InvalidTransitionError('Item', req.from, req.to);

  const expectedFlow = flowFor(req.from, req.to);
  if (req.flow !== expectedFlow) {
    throw new BusinessRuleError('USE_DEDICATED_ACTION', `Moving to ${req.to} is done with the ${expectedFlow} action.`);
  }

  if (req.flow === 'generic' && !hasAny(req.actorRoles, genericStageRoles(req.to))) {
    throw new ForbiddenError(`Your role cannot move items to ${req.to}.`);
  }
  if (req.flow === 'hold') {
    const station = req.to === 'ON_HOLD' ? req.from : req.to;
    const recut = req.from === 'ON_HOLD' && req.heldFromStage === 'STITCHING' && req.to === 'CUTTING';
    if (req.from === 'ON_HOLD' && req.to !== 'CANCELLED' && req.to !== req.heldFromStage && !recut) {
      throw new BusinessRuleError('RESUME_TO_HELD_STAGE', 'An item on hold goes back to the stage it was held at.');
    }
    const resumingStitching = req.from === 'ON_HOLD' && req.heldFromStage === 'STITCHING';
    const allowed = resumingStitching ? MANAGER_ONLY : (HOLD_ROLES[station] ?? []);
    if (!hasAny(req.actorRoles, allowed)) {
      throw new ForbiddenError('Your role cannot hold or resume items at this stage.');
    }
  }

  if (requiresPhoto(req.from, req.to) && !req.photoPath) {
    throw new BusinessRuleError('PHOTO_REQUIRED', 'Upload a stage photo first.');
  }
  if ((req.to === 'REMAKE' || req.to === 'CANCELLED' || req.to === 'ON_HOLD') && !req.note?.trim()) {
    throw new BusinessRuleError('NOTE_REQUIRED', 'Add a note explaining why.');
  }
}

/** Order.status once every item has finished: COMPLETED if anything was delivered, else CANCELLED. */
export function orderStatusWhenItemsFinish(stages: ProductionStage[]): OrderStatus | null {
  if (stages.length === 0) return null;
  const finished = stages.every((s) => s === 'DELIVERED' || s === 'CANCELLED');
  if (!finished) return null;
  return stages.some((s) => s === 'DELIVERED') ? 'COMPLETED' : 'CANCELLED';
}

const STAGE_ORDER = new Map<ProductionStage, number>(PRODUCTION_STAGES.map((s, i) => [s, i]));

/** The least-advanced stage among items still in play, for one status chip per order. */
export function headlineStage(stages: ProductionStage[]): ProductionStage | null {
  const active = stages.filter((s) => s !== 'CANCELLED');
  if (active.length === 0) return stages.length > 0 ? 'CANCELLED' : null;
  // A remake, a query on hold and the old ASSIGNED stage are all "back at the pattern table".
  const rank = (s: ProductionStage) =>
    s === 'REMAKE' || s === 'ON_HOLD' || s === 'ASSIGNED' ? STAGE_ORDER.get('PATTERN')! : STAGE_ORDER.get(s)!;
  return active.reduce((min, s) => (rank(s) < rank(min) ? s : min));
}

/** Items can be cancelled (with a refund) until they ship. */
export const isCancellable = (stage: ProductionStage) => canTransitionStage(stage, 'CANCELLED');
