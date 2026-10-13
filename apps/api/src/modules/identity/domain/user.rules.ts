import { type Role, STAFF_ROLES } from '@abaya/contracts';
import { BusinessRuleError, ForbiddenError } from '../../../common/errors/domain-error';

export const isStaff = (roles: readonly Role[]): boolean => roles.some((r) => STAFF_ROLES.includes(r));

/**
 * Rules for PUT /v1/admin/users/:id/roles:
 * - the platform must always keep at least one SUPER_ADMIN;
 * - a super admin cannot remove their own SUPER_ADMIN role (ask another admin).
 */
export function assertRoleChangeAllowed(input: {
  actorUserId: string;
  targetUserId: string;
  before: readonly Role[];
  after: readonly Role[];
  superAdminCount: number;
}): void {
  const losesSuperAdmin = input.before.includes('SUPER_ADMIN') && !input.after.includes('SUPER_ADMIN');
  if (!losesSuperAdmin) return;
  if (input.actorUserId === input.targetUserId) {
    throw new ForbiddenError('You cannot remove your own SUPER_ADMIN role.', 'CANNOT_DEMOTE_SELF');
  }
  if (input.superAdminCount <= 1) {
    throw new BusinessRuleError('LAST_SUPER_ADMIN', 'At least one SUPER_ADMIN must remain.');
  }
}

/** Normalise a role list: no duplicates, stable order. */
export const normaliseRoles = (roles: readonly Role[]): Role[] => Array.from(new Set(roles)).sort() as Role[];

/** Roles after accepting a staff invite: what they had (e.g. CUSTOMER) plus what the admin gave. */
export const withInvitedRoles = (current: readonly Role[], invited: readonly Role[]): Role[] =>
  normaliseRoles([...current, ...invited.filter((r) => r !== 'CUSTOMER')]);

/** Invites are matched on the email the login provider verified, case-insensitively. */
export const inviteEmailKey = (email: string): string => email.trim().toLowerCase();

/** Maximum saved addresses per customer. */
export const MAX_ADDRESSES = 20;
