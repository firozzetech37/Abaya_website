import { type ProductionStage, type Role, STAFF_ROLES } from '@abaya/contracts';

/**
 * UI-side role checks, mirroring the API guards (docs/domain-model.md §6).
 * Only used to hide actions; the API is the authority and every 403 is handled.
 * SUPER_ADMIN passes every check, as in the API's RolesGuard.
 */
export type Capability =
  | 'viewDesigns'
  | 'editDesigns'
  | 'manageCatalog'
  | 'viewReferences'
  | 'useStudio'
  | 'viewDownloads'
  | 'viewOrders'
  | 'manageProduction'
  | 'recordQc'
  | 'cancelItems'
  | 'refund'
  | 'viewCustomers'
  | 'viewWaitlist'
  | 'manageMakers'
  | 'manageStaff'
  | 'viewAuditLog'
  | 'staffDirectory';

const CAPABILITIES: Record<Capability, readonly Role[]> = {
  viewDesigns: ['CATALOG_MANAGER', 'DESIGNER'],
  editDesigns: ['CATALOG_MANAGER', 'DESIGNER'],
  manageCatalog: ['CATALOG_MANAGER'],
  viewReferences: ['CATALOG_MANAGER', 'DESIGNER'],
  useStudio: ['CATALOG_MANAGER', 'DESIGNER'],
  viewDownloads: ['CATALOG_MANAGER', 'SUPPORT'],
  viewOrders: ['CATALOG_MANAGER', 'PRODUCTION_MANAGER', 'QC', 'SUPPORT'],
  manageProduction: ['PRODUCTION_MANAGER'],
  recordQc: ['QC', 'PRODUCTION_MANAGER'],
  cancelItems: ['SUPPORT'],
  refund: ['SUPPORT'],
  viewCustomers: ['SUPPORT'],
  viewWaitlist: ['SUPPORT', 'CATALOG_MANAGER'],
  manageMakers: ['PRODUCTION_MANAGER'],
  manageStaff: [],
  viewAuditLog: [],
  staffDirectory: ['CATALOG_MANAGER', 'PRODUCTION_MANAGER'],
};

export function can(roles: readonly Role[] | undefined, capability: Capability): boolean {
  if (!roles) return false;
  if (roles.includes('SUPER_ADMIN')) return true;
  return CAPABILITIES[capability].some((r) => roles.includes(r));
}

export const isStaffRole = (role: Role): boolean => STAFF_ROLES.includes(role);

/** Roles allowed on the generic stage endpoint, per target (apps/api orders/domain/order.rules.ts). */
const GENERIC_STAGE_ROLES: Partial<Record<ProductionStage, readonly Role[]>> = {
  PATTERN: ['PRODUCTION_MANAGER', 'PATTERN_TECHNICIAN'],
  CUTTING: ['PRODUCTION_MANAGER', 'PATTERN_TECHNICIAN'],
  STITCHING: ['PRODUCTION_MANAGER', 'CUTTER'],
  QC: ['PRODUCTION_MANAGER', 'MAKER'],
  PACKED: ['PRODUCTION_MANAGER', 'FINISHER'],
  DELIVERED: ['PRODUCTION_MANAGER', 'SUPPORT', 'LOGISTICS'],
  REMAKE: ['PRODUCTION_MANAGER', 'SUPPORT'],
};

export function canMoveToStage(roles: readonly Role[] | undefined, to: ProductionStage): boolean {
  if (!roles) return false;
  if (roles.includes('SUPER_ADMIN')) return true;
  return (GENERIC_STAGE_ROLES[to] ?? []).some((r) => roles.includes(r));
}

/** Stages entered through the generic stage endpoint (others have dedicated flows: QC, ship, hold, cancel). */
export const GENERIC_TARGETS: readonly ProductionStage[] = ['PATTERN', 'CUTTING', 'STITCHING', 'QC', 'PACKED', 'DELIVERED', 'REMAKE'];

/** A stage photo is required for the cut pieces, the stitched piece and the packed parcel. */
export const requiresStagePhoto = (from: ProductionStage, to: ProductionStage): boolean =>
  (from === 'CUTTING' && to === 'STITCHING') || (from === 'STITCHING' && to === 'QC') || (from === 'FINISHING' && to === 'PACKED');

/** A note is required for REMAKE and CANCELLED. */
export const requiresStageNote = (to: ProductionStage): boolean => to === 'REMAKE' || to === 'CANCELLED';
