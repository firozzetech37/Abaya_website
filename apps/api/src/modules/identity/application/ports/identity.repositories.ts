import type { AddressBody, ConsentPurpose, Role } from '@abaya/contracts';
import type { AuditEntry } from '../../../../common/audit/audit';

export interface UserRecord {
  id: string;
  authUserId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  roles: Role[];
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  /** Last use of the site while signed in ("last seen"); null before the first visit after this was added. */
  lastActiveAt: Date | null;
}

export interface UserRepository {
  findByAuthUserId(authUserId: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findManyByIds(ids: string[]): Promise<UserRecord[]>;
  /** Records that the user is using the site now. */
  touchActive(id: string, at: Date): Promise<void>;
  /** Creates a CUSTOMER; if email/phone already belong to another account, they are left empty. */
  createCustomer(input: { authUserId: string; email?: string; phone?: string }): Promise<UserRecord>;
  updateProfile(id: string, input: { name?: string; phone?: string }): Promise<UserRecord>;
  list(query: { q?: string; role?: Role; audience?: 'customers' | 'staff'; cursor?: string; limit: number }): Promise<{
    items: UserRecord[];
    nextCursor: string | null;
  }>;
  countWithRole(role: Role): Promise<number>;
  /** Accounts (not deleted) for an audience, optionally created since a date. */
  countAudience(audience: 'customers' | 'staff' | 'all', since?: Date): Promise<number>;
  /** Active users whose phone ends with these 10 digits (phones are stored with or without +91). */
  findByPhoneDigits(last10: string): Promise<UserRecord[]>;
  findByEmail(email: string): Promise<UserRecord | null>;
  setRoles(id: string, roles: Role[], audit: AuditEntry): Promise<UserRecord>;
  /** DPDP erasure: remove name/email/phone and addresses, deactivate, keep the row for order history. */
  scrub(id: string, audit: AuditEntry): Promise<void>;
  exportForUser(id: string): Promise<Record<string, unknown>>;
}

export interface AddressRecord {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
}

export interface AddressRepository {
  listForUser(userId: string): Promise<AddressRecord[]>;
  findForUser(userId: string, id: string): Promise<AddressRecord | null>;
  countForUser(userId: string): Promise<number>;
  /** Creates the address; when isDefault, clears the flag on the user's other addresses. */
  create(userId: string, input: AddressBody): Promise<AddressRecord>;
  update(userId: string, id: string, input: Partial<AddressBody>): Promise<AddressRecord>;
  delete(userId: string, id: string): Promise<void>;
}

export interface ConsentRecordDto {
  purpose: ConsentPurpose;
  granted: boolean;
  version: string;
  createdAt: Date;
}

export interface ConsentRepository {
  record(
    userId: string,
    version: string,
    consents: { purpose: ConsentPurpose; granted: boolean }[],
    ip?: string,
  ): Promise<void>;
  /** Latest record per purpose. */
  latestForUser(userId: string): Promise<ConsentRecordDto[]>;
}

export interface StaffInviteRecord {
  id: string;
  email: string;
  name: string | null;
  roles: Role[];
  status: 'PENDING' | 'ACCEPTED' | 'CANCELLED';
  invitedBy: { id: string; name: string | null; email: string | null } | null;
  acceptedUserId: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
}

export interface StaffInviteRepository {
  findPendingByEmail(email: string): Promise<StaffInviteRecord | null>;
  /** Pending invites first, then the most recent others. */
  list(limit: number): Promise<StaffInviteRecord[]>;
  /** One pending invite per email: creates it, or replaces the roles/name of the existing one. */
  upsertPending(input: { email: string; name: string | null; roles: Role[]; invitedById: string }, audit: AuditEntry): Promise<StaffInviteRecord>;
  cancel(id: string, audit: AuditEntry): Promise<StaffInviteRecord | null>;
  /** In one transaction: give the user the roles (and the invited name if they have none), close the invite. */
  accept(inviteId: string, user: { id: string; roles: Role[]; name: string | null; inviteName: string | null }, audit: AuditEntry): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const STAFF_INVITE_REPOSITORY = Symbol('STAFF_INVITE_REPOSITORY');
export const ADDRESS_REPOSITORY = Symbol('ADDRESS_REPOSITORY');
export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');
