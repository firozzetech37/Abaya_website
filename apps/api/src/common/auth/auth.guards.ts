import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role, STAFF_ROLES } from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { DomainError, ForbiddenError } from '../errors/domain-error';
import { AUTH_USER_RESOLVER, type AuthUserResolver } from './auth.types';
import { type AuthedRequest, IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { TokenVerifier } from './token-verifier';

class UnauthenticatedError extends DomainError {
  constructor(message = 'Please log in.') {
    super('UNAUTHENTICATED', 'UNAUTHENTICATED', message);
  }
}

function bearerToken(req: AuthedRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Global guard #1: verifies the Clerk session token and loads our User onto `req.user`.
 * Routes marked @Public() pass without a token; a valid token is still attached.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    @Inject(AUTH_USER_RESOLVER) private readonly users: AuthUserResolver,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(req);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthenticatedError();
    }

    const claims = await this.verifier.verify(token);
    if (!claims) {
      if (isPublic) return true;
      throw new UnauthenticatedError('Your session has expired. Please log in again.');
    }

    const user = await this.users.resolve(claims);
    if (!user) {
      if (isPublic) return true;
      throw new UnauthenticatedError('This account is not active.');
    }

    req.user = { ...user, aal: claims.aal };
    return true;
  }
}

/**
 * Global guard #2: enforces @Roles(). SUPER_ADMIN passes every role check.
 * Staff routes also require MFA (aal2) when STAFF_MFA_REQUIRED is on.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'STAFF_MFA_REQUIRED'>,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new UnauthenticatedError();

    const allowed = user.roles.includes('SUPER_ADMIN') || user.roles.some((r) => required.includes(r));
    if (!allowed) throw new ForbiddenError();

    const staffRoute = required.some((r) => STAFF_ROLES.includes(r));
    if (staffRoute && this.config.STAFF_MFA_REQUIRED && user.aal !== 'aal2') {
      throw new ForbiddenError('Staff accounts must use two-factor login.', 'MFA_REQUIRED');
    }
    return true;
  }
}
