import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@abaya/contracts';
import { RolesGuard, SessionAuthGuard } from './auth.guards';
import type { AuthenticatedUser, AuthUserResolver, VerifiedToken } from './auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import type { TokenVerifier } from './token-verifier';

function context(opts: { roles?: Role[]; isPublic?: boolean; user?: Partial<AuthenticatedUser>; auth?: string }) {
  const handler = () => undefined;
  if (opts.roles) Reflect.defineMetadata(ROLES_KEY, opts.roles, handler);
  if (opts.isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  const req: Record<string, unknown> = { headers: opts.auth ? { authorization: opts.auth } : {} };
  if (opts.user) req.user = { aal: 'aal1', roles: [], ...opts.user };
  const ctx = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('RolesGuard', () => {
  const guard = (mfa = false) => new RolesGuard(new Reflector(), { STAFF_MFA_REQUIRED: mfa });

  it('allows any logged-in user when the route has no @Roles', () => {
    expect(guard().canActivate(context({ user: { roles: ['CUSTOMER'] } }).ctx)).toBe(true);
  });

  it('rejects a user without the role (403)', () => {
    expect(() => guard().canActivate(context({ roles: ['CATALOG_MANAGER'], user: { roles: ['CUSTOMER'] } }).ctx)).toThrow(
      /not allowed/,
    );
  });

  it('allows a user holding any listed role', () => {
    const { ctx } = context({ roles: ['DESIGNER', 'CATALOG_MANAGER'], user: { roles: ['CUSTOMER', 'DESIGNER'] } });
    expect(guard().canActivate(ctx)).toBe(true);
  });

  it('always allows SUPER_ADMIN', () => {
    expect(guard().canActivate(context({ roles: ['QC'], user: { roles: ['SUPER_ADMIN'] } }).ctx)).toBe(true);
  });

  it('rejects when there is no user (401)', () => {
    expect(() => guard().canActivate(context({ roles: ['QC'] }).ctx)).toThrow(/log in/);
  });

  it('requires MFA (aal2) on staff routes when enabled', () => {
    const staffAal1 = context({ roles: ['CATALOG_MANAGER'], user: { roles: ['CATALOG_MANAGER'], aal: 'aal1' } });
    expect(() => guard(true).canActivate(staffAal1.ctx)).toThrow(/two-factor/);
    const staffAal2 = context({ roles: ['CATALOG_MANAGER'], user: { roles: ['CATALOG_MANAGER'], aal: 'aal2' } });
    expect(guard(true).canActivate(staffAal2.ctx)).toBe(true);
    expect(guard(false).canActivate(staffAal1.ctx)).toBe(true);
  });
});

describe('SessionAuthGuard', () => {
  const claims: VerifiedToken = { sub: 'auth-1', email: 'a@example.com', aal: 'aal1' };
  const dbUser = { id: 'u1', authUserId: 'auth-1', email: 'a@example.com', phone: null, name: null, roles: ['CUSTOMER'] as Role[] };

  const make = (verify: VerifiedToken | null, resolved: typeof dbUser | null = dbUser) => {
    const verifier = { verify: vi.fn().mockResolvedValue(verify) } as unknown as TokenVerifier;
    const users: AuthUserResolver = { resolve: vi.fn().mockResolvedValue(resolved) };
    return new SessionAuthGuard(new Reflector(), verifier, users);
  };

  it('rejects protected routes without a token (401)', async () => {
    await expect(make(claims).canActivate(context({}).ctx)).rejects.toThrow(/log in/);
  });

  it('rejects an invalid or expired token (401)', async () => {
    await expect(make(null).canActivate(context({ auth: 'Bearer bad' }).ctx)).rejects.toThrow(/expired/);
  });

  it('rejects deleted or blocked users (401)', async () => {
    await expect(make(claims, null).canActivate(context({ auth: 'Bearer ok' }).ctx)).rejects.toThrow(/not active/);
  });

  it('attaches the user with the token assurance level', async () => {
    const { ctx, req } = context({ auth: 'Bearer ok' });
    await expect(make({ ...claims, aal: 'aal2' }).canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toMatchObject({ id: 'u1', roles: ['CUSTOMER'], aal: 'aal2' });
  });

  it('lets public routes through without a token, and ignores a bad one', async () => {
    await expect(make(claims).canActivate(context({ isPublic: true }).ctx)).resolves.toBe(true);
    const { ctx, req } = context({ isPublic: true, auth: 'Bearer bad' });
    await expect(make(null).canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });
});
