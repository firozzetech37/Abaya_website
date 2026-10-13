import { Inject, Injectable } from '@nestjs/common';
import type { AdminUserDto, Paginated, Role, StaffInviteBody, StaffInviteDto, StaffInviteResult } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { EVENT_PUBLISHER, EVENTS, type EventPublisher } from '../../../common/events/events';
import { NotFoundError } from '../../../common/errors/domain-error';
import { assertRoleChangeAllowed, inviteEmailKey, normaliseRoles, withInvitedRoles } from '../domain/user.rules';
import {
  STAFF_INVITE_REPOSITORY,
  type StaffInviteRecord,
  type StaffInviteRepository,
  USER_REPOSITORY,
  type UserRecord,
  type UserRepository,
} from './ports/identity.repositories';

const toDto = (u: UserRecord): AdminUserDto => ({
  id: u.id,
  email: u.email,
  phone: u.phone,
  name: u.name,
  roles: u.roles,
  isActive: u.isActive,
  createdAt: u.createdAt.toISOString(),
});

const toInviteDto = (i: StaffInviteRecord): StaffInviteDto => ({
  id: i.id,
  email: i.email,
  name: i.name,
  roles: i.roles,
  status: i.status,
  invitedBy: i.invitedBy,
  createdAt: i.createdAt.toISOString(),
  acceptedAt: i.acceptedAt?.toISOString() ?? null,
});

/** SUPER_ADMIN: list users, change roles and invite staff by email (all audited). */
@Injectable()
export class StaffService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(STAFF_INVITE_REPOSITORY) private readonly invites: StaffInviteRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  /**
   * Add a staff member by email. Someone who already has an account gets the roles now;
   * anyone else gets them automatically on their first sign-in with that email. A tailor
   * also gets their tailor record (production), linked to the login on their first visit.
   */
  async invite(actor: Actor, body: StaffInviteBody): Promise<StaffInviteResult> {
    const email = inviteEmailKey(body.email);
    const roles = normaliseRoles(body.roles);
    if (roles.includes('MAKER') && body.tailor) {
      await this.events.publish(EVENTS.TailorAdded, {
        email,
        name: body.name ?? null,
        city: body.tailor.city,
        actorUserId: actor.userId,
        ip: actor.ip,
      });
    }
    const existing = await this.users.findByEmail(email);
    if (existing) {
      const next = withInvitedRoles(existing.roles, roles);
      const user = next.join() === normaliseRoles(existing.roles).join() ? toDto(existing) : await this.setRoles(actor, existing.id, next);
      return { invite: null, user };
    }
    const invite = await this.invites.upsertPending(
      { email, name: body.name ?? null, roles, invitedById: actor.userId },
      {
        actorUserId: actor.userId,
        action: 'staff.invited',
        entityType: 'StaffInvite',
        entityId: '', // filled in by the repository
        after: { email, roles },
        ip: actor.ip,
      },
    );
    return { invite: toInviteDto(invite), user: null };
  }

  async listInvites(): Promise<StaffInviteDto[]> {
    return (await this.invites.list(50)).map(toInviteDto);
  }

  async cancelInvite(actor: Actor, id: string): Promise<StaffInviteDto> {
    const cancelled = await this.invites.cancel(id, {
      actorUserId: actor.userId,
      action: 'staff.invite_cancelled',
      entityType: 'StaffInvite',
      entityId: id,
      ip: actor.ip,
    });
    if (!cancelled) throw new NotFoundError('Pending invite');
    return toInviteDto(cancelled);
  }

  async list(query: { q?: string; role?: Role; cursor?: string; limit: number }): Promise<Paginated<AdminUserDto>> {
    const page = await this.users.list(query);
    return { items: page.items.map(toDto), nextCursor: page.nextCursor };
  }

  /** Names of staff holding a role (e.g. designers to assign references to). Never customers. */
  async directory(role: Role): Promise<{ id: string; name: string | null; email: string | null }[]> {
    if (role === 'CUSTOMER') return [];
    const page = await this.users.list({ role, limit: 100 });
    return page.items.filter((u) => u.isActive).map((u) => ({ id: u.id, name: u.name, email: u.email }));
  }

  async setRoles(actor: Actor, userId: string, roles: Role[]): Promise<AdminUserDto> {
    const user = await this.users.findById(userId);
    if (!user || user.deletedAt) throw new NotFoundError('User');
    const next = normaliseRoles(roles);
    assertRoleChangeAllowed({
      actorUserId: actor.userId,
      targetUserId: userId,
      before: user.roles,
      after: next,
      superAdminCount: await this.users.countWithRole('SUPER_ADMIN'),
    });
    const updated = await this.users.setRoles(userId, next, {
      actorUserId: actor.userId,
      action: 'user.roles_changed',
      entityType: 'User',
      entityId: userId,
      before: { roles: user.roles },
      after: { roles: next },
      ip: actor.ip,
    });
    return toDto(updated);
  }
}
