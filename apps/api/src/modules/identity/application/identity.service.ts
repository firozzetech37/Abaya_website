import { Inject, Injectable } from '@nestjs/common';
import type { AddressSnapshot, ConsentPurpose, MeResponse, RecordConsentsBody, Role } from '@abaya/contracts';
import type { AuditEntry } from '../../../common/audit/audit';
import {
  AUTH_PROVIDER_ADMIN,
  type AuthProviderAdmin,
  type AuthUserResolver,
  type VerifiedToken,
} from '../../../common/auth/auth.types';
import { NotFoundError } from '../../../common/errors/domain-error';
import { inviteEmailKey, isStaff, withInvitedRoles } from '../domain/user.rules';
import {
  ADDRESS_REPOSITORY,
  type AddressRepository,
  CONSENT_REPOSITORY,
  type ConsentRepository,
  STAFF_INVITE_REPOSITORY,
  type StaffInviteRepository,
  USER_REPOSITORY,
  type UserRecord,
  type UserRepository,
} from './ports/identity.repositories';

export interface UserContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  roles: Role[];
}

export interface CustomerAccount extends UserContact {
  isActive: boolean;
  createdAt: Date;
}

/**
 * Identity's exported application service. Other modules call it instead of
 * reading User/Address tables; the auth guard uses it as its AuthUserResolver.
 */
/** How often signed-in activity is written (one small update per user per 10 minutes at most). */
const ACTIVITY_WRITE_EVERY_MS = 10 * 60_000;

@Injectable()
export class IdentityService implements AuthUserResolver {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: AddressRepository,
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(AUTH_PROVIDER_ADMIN) private readonly authAdmin: AuthProviderAdmin,
    @Inject(STAFF_INVITE_REPOSITORY) private readonly invites: StaffInviteRepository,
  ) {}

  async resolve(token: VerifiedToken) {
    const existing =
      (await this.users.findByAuthUserId(token.sub)) ?? (await this.acceptPendingInvite(await this.createFromProvider(token)));
    if (!existing.isActive || existing.deletedAt) return null;
    // "Last seen": signed-in use of the site (written at most every 10 minutes, without holding
    // up the request).
    const now = new Date();
    if (!existing.lastActiveAt || now.getTime() - existing.lastActiveAt.getTime() > ACTIVITY_WRITE_EVERY_MS) {
      void this.users.touchActive(existing.id, now).catch(() => undefined);
    }
    return {
      id: existing.id,
      authUserId: existing.authUserId,
      email: existing.email,
      phone: existing.phone,
      name: existing.name,
      roles: existing.roles,
    };
  }

  /** First login: email/phone come from token claims when configured, else from Clerk's API. */
  private async createFromProvider(token: VerifiedToken) {
    const profile = token.email || token.phone ? { email: token.email, phone: token.phone } : await this.authAdmin.getProfile(token.sub);
    return this.users.createCustomer({ authUserId: token.sub, email: profile.email, phone: profile.phone });
  }

  /**
   * First sign-in of someone the admin added by email (Staff & roles → Add staff): the
   * provider has verified the email, so the invited roles are granted now and audited.
   */
  private async acceptPendingInvite(user: UserRecord): Promise<UserRecord> {
    if (!user.email) return user;
    const invite = await this.invites.findPendingByEmail(inviteEmailKey(user.email));
    if (!invite) return user;
    const roles = withInvitedRoles(user.roles, invite.roles);
    await this.invites.accept(invite.id, { id: user.id, roles, name: user.name, inviteName: invite.name }, {
      actorUserId: user.id,
      action: 'user.roles_changed',
      entityType: 'User',
      entityId: user.id,
      before: { roles: user.roles },
      after: { roles, via: 'staff_invite', inviteId: invite.id, invitedBy: invite.invitedBy?.id ?? null },
    });
    return (await this.users.findById(user.id)) ?? user;
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.requireUser(userId);
    const consents = await this.consents.latestForUser(userId);
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      roles: user.roles,
      isStaff: isStaff(user.roles),
      consents: consents.map((c) => ({
        purpose: c.purpose,
        granted: c.granted,
        version: c.version,
        recordedAt: c.createdAt.toISOString(),
      })),
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateProfile(userId: string, input: { name?: string; phone?: string }): Promise<MeResponse> {
    await this.users.updateProfile(userId, input);
    return this.me(userId);
  }

  async recordConsents(userId: string, body: RecordConsentsBody, ip?: string): Promise<MeResponse> {
    await this.consents.record(userId, body.version, body.consents, ip);
    return this.me(userId);
  }

  /** True when the user's latest record for this purpose is a grant. */
  async hasConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
    const latest = (await this.consents.latestForUser(userId)).find((c) => c.purpose === purpose);
    return latest?.granted === true;
  }

  /** Contact details for notifications and role-gated admin views. */
  async getContacts(userIds: string[]): Promise<Map<string, UserContact>> {
    const rows = await this.users.findManyByIds(Array.from(new Set(userIds)));
    return new Map(
      rows.map((u) => [u.id, { id: u.id, name: u.name, email: u.email, phone: u.phone, roles: u.roles }]),
    );
  }

  async getContact(userId: string): Promise<UserContact | null> {
    return (await this.getContacts([userId])).get(userId) ?? null;
  }

  /** Copy of an address for an order; throws when it is not the user's. */
  async getAddressSnapshot(userId: string, addressId: string): Promise<AddressSnapshot> {
    const a = await this.addresses.findForUser(userId, addressId);
    if (!a) throw new NotFoundError('Address');
    return {
      fullName: a.fullName,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2,
      landmark: a.landmark,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      country: a.country,
    };
  }

  exportForUser(userId: string): Promise<Record<string, unknown>> {
    return this.users.exportForUser(userId);
  }

  /** Remove personal details and deactivate the account (the row stays for order history). */
  scrub(userId: string, audit: AuditEntry): Promise<void> {
    return this.users.scrub(userId, audit);
  }

  async findUserIdByEmail(email: string): Promise<string | null> {
    return (await this.users.findByEmail(email))?.id ?? null;
  }

  /** The single active user with this Indian mobile number, or null (none, or ambiguous). */
  async findUserIdByPhone(phone: string): Promise<string | null> {
    const last10 = phone.replace(/\D/g, '').slice(-10);
    if (last10.length !== 10) return null;
    const users = await this.users.findByPhoneDigits(last10);
    return users.length === 1 ? users[0]!.id : null;
  }

  /**
   * Add or remove one role as a side effect of another audited action (linking a
   * tailor's login grants MAKER). General role management stays with SUPER_ADMIN.
   */
  async setRole(userId: string, role: Role, enabled: boolean, audit: Omit<AuditEntry, 'before' | 'after' | 'entityType' | 'entityId' | 'action'>): Promise<void> {
    const user = await this.requireUser(userId);
    const next = enabled
      ? Array.from(new Set([...user.roles, role]))
      : user.roles.filter((r) => r !== role);
    if (next.length === 0) next.push('CUSTOMER');
    if (next.length === user.roles.length && next.every((r) => user.roles.includes(r))) return;
    await this.users.setRoles(userId, next, {
      ...audit,
      action: 'user.roles_changed',
      entityType: 'User',
      entityId: userId,
      before: { roles: user.roles },
      after: { roles: next },
    });
  }

  /** User ids matching an email/phone/name search (admin order search). */
  /** Customer accounts, newest first, optionally filtered by name, email or phone. */
  listCustomers(query: {
    q?: string;
    audience?: 'customers' | 'staff' | 'all';
    cursor?: string;
    limit: number;
  }): Promise<{ items: CustomerAccount[]; nextCursor: string | null }> {
    const { audience = 'customers', ...rest } = query;
    return this.users.list({ ...rest, audience: audience === 'all' ? undefined : audience }).then((page) => ({
      nextCursor: page.nextCursor,
      items: page.items.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        roles: u.roles,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
    }));
  }

  countAccounts(audience: 'customers' | 'staff' | 'all', since?: Date): Promise<number> {
    return this.users.countAudience(audience, since);
  }

  async searchUserIds(q: string, limit = 50): Promise<string[]> {
    return (await this.users.list({ q, limit })).items.map((u) => u.id);
  }

  /** Active users holding a role (names for pickers such as the workshop team). */
  async usersWithRole(role: Role): Promise<UserContact[]> {
    const page = await this.users.list({ role, limit: 200 });
    return page.items
      .filter((u) => u.isActive && !u.deletedAt)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, roles: u.roles }));
  }

  /** True when the user exists, is active, and holds the role. */
  async hasRole(userId: string, role: Role): Promise<boolean> {
    const user = await this.users.findById(userId);
    return Boolean(user && user.isActive && !user.deletedAt && user.roles.includes(role));
  }

  private async requireUser(userId: string): Promise<UserRecord> {
    const user = await this.users.findById(userId);
    if (!user || user.deletedAt) throw new NotFoundError('User');
    return user;
  }
}
