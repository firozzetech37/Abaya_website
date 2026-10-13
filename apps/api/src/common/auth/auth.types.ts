import type { Role } from '@abaya/contracts';

/** Claims we read from a verified Clerk session token. */
export interface VerifiedToken {
  /** Clerk user id, e.g. "user_2abc…". */
  sub: string;
  /** Only present if added as custom session-token claims in the Clerk dashboard. */
  email?: string;
  phone?: string;
  /** aal2 = a second factor (MFA) was verified in this session. */
  aal: 'aal1' | 'aal2';
}

/** Profile and account operations at the login provider (Clerk Backend API). */
export interface AuthProviderAdmin {
  getProfile(authUserId: string): Promise<{ email?: string; phone?: string; name?: string }>;
  deleteUser(authUserId: string): Promise<void>;
}
export const AUTH_PROVIDER_ADMIN = Symbol('AUTH_PROVIDER_ADMIN');

/** Our own user, loaded from the database after the token is verified. */
export interface AuthenticatedUser {
  id: string;
  authUserId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  roles: Role[];
  aal: 'aal1' | 'aal2';
}

/** Who performed an action, for audit logs and ownership checks. */
export interface Actor {
  userId: string;
  roles: Role[];
  ip?: string;
}

/**
 * Port implemented by the identity module: load our User for a verified token,
 * creating a CUSTOMER on first sight. Returns null for deleted or blocked users.
 */
export interface AuthUserResolver {
  resolve(token: VerifiedToken): Promise<Omit<AuthenticatedUser, 'aal'> | null>;
}
export const AUTH_USER_RESOLVER = Symbol('AUTH_USER_RESOLVER');
