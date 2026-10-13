import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { ADMIN_PANEL_ROLES, type Role } from '@abaya/contracts';
import type { Request } from 'express';
import type { Actor, AuthenticatedUser } from './auth.types';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** No login needed. A valid token is still read, so handlers may personalise. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Only users holding at least one of these roles. SUPER_ADMIN is always allowed. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Staff who may read admin-panel data (workshop-only roles use /v1/workshop instead). */
export const StaffOnly = () => Roles(...ADMIN_PANEL_ROLES);

export type AuthedRequest = Request & { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user,
);

/** The acting user as `{ userId, roles, ip }` for use cases and audit logs. */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor | undefined => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) return undefined;
  return { userId: req.user.id, roles: req.user.roles, ip: req.ip };
});
