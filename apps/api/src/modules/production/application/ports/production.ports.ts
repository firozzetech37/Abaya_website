import type { PatternBody, SelfCheckPoint, TechPackContent } from '@abaya/contracts';
import type { AuditEntry } from '../../../../common/audit/audit';

export interface MakerRecord {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  city: string;
  skills: string[];
  capacityPerWeek: number;
  rating: number;
  isActive: boolean;
}

export interface MakerInput {
  name?: string;
  phone?: string | null;
  email?: string;
  city?: string;
  skills?: string[];
  capacityPerWeek?: number;
  isActive?: boolean;
}

export interface TechPackRecord {
  id: string;
  orderItemId: string;
  content: TechPackContent;
  status: 'DRAFT' | 'APPROVED';
  approvedBy: { id: string; name: string | null } | null;
  approvedAt: Date | null;
  updatedAt: Date;
}

export interface QcRecord {
  id: string;
  orderItemId: string;
  result: 'PASS' | 'FAIL';
  checklist: { item: string; ok: boolean }[];
  notes: string | null;
  photoPaths: string[];
  checkedBy: { id: string; name: string | null } | null;
  createdAt: Date;
}

export interface PayoutRecord {
  id: string;
  makerId: string;
  orderItemId: string | null;
  amountInPaise: number;
  status: 'PENDING' | 'PAID';
  reference: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface PatternRecord {
  id: string;
  orderItemId: string;
  version: number;
  status: 'DRAFT' | 'CONFIRMED';
  content: PatternBody;
  createdBy: { id: string; name: string | null } | null;
  confirmedBy: { id: string; name: string | null } | null;
  confirmedAt: Date | null;
  updatedAt: Date;
}

export interface CuttingRecordRow {
  id: string;
  orderItemId: string;
  attempt: number;
  fabricLot: string;
  colourConfirmed: boolean;
  fabricUsedCm: number;
  estimateCm: number | null;
  wastageCm: number | null;
  liningUsedCm: number | null;
  pieces: { name: string; count: number; cut: boolean }[];
  notes: string;
  photoPath: string;
  cutBy: { id: string; name: string | null } | null;
  createdAt: Date;
}

export interface AssignmentRow {
  orderItemId: string;
  station: string;
  userId: string;
}

export interface StitchingRecordRow {
  id: string;
  orderItemId: string;
  attempt: number;
  checklist: { key: string; label: string; done: boolean }[];
  measurements: { key: SelfCheckPoint; measuredCm: number; targetCm: number | null }[];
  notes: string;
  photoPath: string;
  makerId: string | null;
  stitchedBy: { id: string; name: string | null } | null;
  startedAt: Date | null;
  createdAt: Date;
}

export interface ProductionRepository {
  listMakers(): Promise<MakerRecord[]>;
  findMaker(id: string): Promise<MakerRecord | null>;
  findMakers(ids: string[]): Promise<MakerRecord[]>;
  findMakerByUserId(userId: string): Promise<MakerRecord | null>;
  /** Link (or unlink with null) the user account a tailor logs in with. */
  setMakerUser(makerId: string, userId: string | null, audit: AuditEntry): Promise<MakerRecord>;
  createMaker(input: Required<Omit<MakerInput, 'isActive' | 'email'>> & { isActive: boolean; email?: string }, audit: AuditEntry): Promise<MakerRecord>;
  /** Active makers without a linked login whose email matches, or whose phone ends with these 10 digits. */
  findMakerByEmail(email: string): Promise<MakerRecord | null>;
  findUnlinkedMakers(match: { email?: string | null; phoneLast10?: string | null }): Promise<MakerRecord[]>;
  updateMaker(id: string, input: MakerInput, audit: AuditEntry): Promise<MakerRecord>;

  findTechPack(orderItemId: string): Promise<TechPackRecord | null>;
  findTechPacks(orderItemIds: string[]): Promise<TechPackRecord[]>;
  saveTechPack(orderItemId: string, content: TechPackContent, approvedById: string | null, audit?: AuditEntry): Promise<TechPackRecord>;

  /** Every version of the item's pattern, newest first. */
  listPatterns(orderItemId: string): Promise<PatternRecord[]>;
  /** Latest version per item (for order pages and job cards). */
  latestPatterns(orderItemIds: string[]): Promise<Map<string, PatternRecord>>;
  /** Update the latest draft, or start the next version when the latest is confirmed (or none exists). */
  savePatternDraft(orderItemId: string, content: PatternBody, userId: string): Promise<PatternRecord>;
  confirmPattern(patternId: string, userId: string, audit: AuditEntry): Promise<PatternRecord>;

  /** Cutting records per item, newest attempt first. */
  listCuttings(orderItemIds: string[]): Promise<CuttingRecordRow[]>;
  /** Adds the next attempt for the item (1, 2, …). */
  addCutting(
    input: Omit<CuttingRecordRow, 'id' | 'attempt' | 'cutBy' | 'createdAt'> & { cutById: string },
    audit: AuditEntry,
  ): Promise<CuttingRecordRow>;

  /** Stitching records per item, newest attempt first. */
  listStitchings(orderItemIds: string[]): Promise<StitchingRecordRow[]>;
  /** Workshop team (one person per station) of these items. */
  listAssignments(orderItemIds: string[]): Promise<AssignmentRow[]>;
  listAssignmentsForUsers(userIds: string[]): Promise<AssignmentRow[]>;
  /** In one transaction: set (userId) or clear (null) each station, and write the audit entry. */
  setAssignments(orderItemId: string, changes: { station: string; userId: string | null }[], assignedById: string, audit: AuditEntry): Promise<void>;
  addStitching(
    input: Omit<StitchingRecordRow, 'id' | 'attempt' | 'stitchedBy' | 'createdAt'> & { stitchedById: string },
    audit: AuditEntry,
  ): Promise<StitchingRecordRow>;

  addQcCheck(input: Omit<QcRecord, 'id' | 'checkedBy' | 'createdAt'> & { checkedById: string }, audit: AuditEntry): Promise<QcRecord>;
  listQcChecks(orderItemIds: string[]): Promise<QcRecord[]>;

  createPayout(input: { makerId: string; orderItemId: string; amountInPaise: number }): Promise<PayoutRecord>;
  /** Creates the payout unless this maker already has one for this item; returns null when skipped. */
  createPayoutOnce(input: { makerId: string; orderItemId: string; amountInPaise: number }): Promise<PayoutRecord | null>;
  listPayouts(makerId: string): Promise<PayoutRecord[]>;
  pendingPayoutTotals(): Promise<Map<string, number>>;
  markPayoutPaid(makerId: string, payoutId: string, reference: string, audit: AuditEntry): Promise<PayoutRecord | null>;
}
export const PRODUCTION_REPOSITORY = Symbol('PRODUCTION_REPOSITORY');
