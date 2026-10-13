import {
  type ProductionStage,
  type Role,
  stationForStage,
  stationsForRoles,
  type WorkshopAction,
  type WorkshopStation,
} from '@abaya/contracts';

/**
 * Workshop stations (docs/apps/workshop.md). Plain TypeScript: which buttons a person gets
 * on an item. The API re-checks every action through OrdersService.changeStage as well.
 */

const isManager = (roles: readonly Role[]) => roles.includes('SUPER_ADMIN') || roles.includes('PRODUCTION_MANAGER');

/** Station an item belongs to right now; items on hold stay with the station that held them. */
export const stationOfItem = (stage: ProductionStage, heldFromStage: ProductionStage | null): WorkshopStation | null =>
  stationForStage(stage === 'ON_HOLD' && heldFromStage ? heldFromStage : stage);

/** Only customer contact the workshop ever sees: dispatch needs it to ship. */
export const mayContactCustomer = (roles: readonly Role[]) => isManager(roles) || roles.includes('LOGISTICS');

export interface WorkshopItemState {
  stage: ProductionStage;
  heldFromStage: ProductionStage | null;
  claimedById: string | null;
  /** Stitching: the item is assigned to the caller's own tailor account. */
  isOwnStitching: boolean;
  /**
   * The person assigned to the item's current station (pattern, cutting, QC, finishing).
   * Null: nobody assigned (older orders, logistics) — open to anyone at the station.
   */
  assignedToId: string | null;
}

/** The next step each stage offers (the move a station makes when its work is done). */
const NEXT_STEP: Partial<Record<ProductionStage, WorkshopAction>> = {
  SPEC_APPROVED: { kind: 'advance', to: 'PATTERN', photoRequired: false }, // start the pattern
  PATTERN: { kind: 'advance', to: 'CUTTING', photoRequired: false }, // pattern confirmed
  CUTTING: { kind: 'advance', to: 'STITCHING', photoRequired: true }, // cut pieces
  STITCHING: { kind: 'advance', to: 'QC', photoRequired: true }, // stitched piece
  QC: { kind: 'qc', to: null, photoRequired: false }, // checklist form, pass or fail
  FINISHING: { kind: 'advance', to: 'PACKED', photoRequired: true }, // packed parcel
  PACKED: { kind: 'ship', to: 'SHIPPED', photoRequired: false }, // carrier + tracking number
  SHIPPED: { kind: 'deliver', to: 'DELIVERED', photoRequired: false },
};

/** Stages where work can be paused with a question (at stitching: a problem with the cut kit). */
const HOLDABLE: ProductionStage[] = ['SPEC_APPROVED', 'PATTERN', 'CUTTING', 'STITCHING'];

/**
 * Whether this person may open the item at all: tailors only their own stitching work, and
 * at a station with an assigned person only that person (managers open everything).
 */
export function mayOpen(
  roles: readonly Role[],
  actorId: string,
  station: WorkshopStation | null,
  item: Pick<WorkshopItemState, 'isOwnStitching' | 'assignedToId'>,
): boolean {
  if (isManager(roles)) return true;
  if (!station || !stationsForRoles(roles).includes(station)) return false;
  if (station === 'stitching') return item.isOwnStitching;
  return item.assignedToId === null || item.assignedToId === actorId;
}

/** Buttons for this person on this item right now. */
export function actionsFor(roles: readonly Role[], actorId: string, item: WorkshopItemState): WorkshopAction[] {
  const station = stationOfItem(item.stage, item.heldFromStage);
  if (!mayOpen(roles, actorId, station, item)) return [];
  // An assigned job belongs to its person: they start it, but cannot hand it back to a queue.
  const assigned = station === 'stitching' || item.assignedToId !== null;
  const manager = isManager(roles);
  const action = (kind: WorkshopAction['kind'], to: ProductionStage | null = null, photoRequired = false): WorkshopAction => ({
    kind,
    to,
    photoRequired,
  });

  if (item.stage === 'ON_HOLD') {
    if (!item.heldFromStage) return [];
    // A stitching problem is the production manager's decision: carry on, or re-cut.
    if (item.heldFromStage === 'STITCHING') return manager ? [action('resume', 'STITCHING'), action('resume', 'CUTTING')] : [];
    return [action('resume', item.heldFromStage)];
  }

  const out: WorkshopAction[] = [];
  const takenBySomeoneElse = item.claimedById !== null && item.claimedById !== actorId;
  // Starting a pattern takes the job; everywhere else a person starts (takes) it explicitly.
  if (item.stage !== 'SPEC_APPROVED' && item.stage !== 'SHIPPED') {
    if (item.claimedById === null) out.push(action('claim'));
    else if (manager || (!assigned && item.claimedById === actorId)) out.push(action('release'));
  }
  const next = NEXT_STEP[item.stage];
  if (next && (!takenBySomeoneElse || manager)) out.push(next);
  if (HOLDABLE.includes(item.stage) && (!takenBySomeoneElse || manager)) out.push(action('hold', 'ON_HOLD'));
  return out;
}

export const isOverdue = (dueDate: Date | null, now: Date): boolean => dueDate !== null && dueDate.getTime() < now.getTime();
