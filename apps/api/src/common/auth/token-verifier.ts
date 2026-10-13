import { Inject, Injectable } from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import type { VerifiedToken } from './auth.types';

/**
 * Verifies Clerk session tokens (RS256). Networkless when CLERK_JWT_KEY is set;
 * otherwise Clerk's JWKS is fetched (and cached) with the secret key.
 */
@Injectable()
export class TokenVerifier {
  private readonly options: Parameters<typeof verifyToken>[1];
  private readonly parties: string[];

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.parties = config.CLERK_AUTHORIZED_PARTIES.length > 0 ? config.CLERK_AUTHORIZED_PARTIES : config.CORS_ORIGINS;
    this.options = {
      secretKey: config.CLERK_SECRET_KEY,
      ...(config.CLERK_JWT_KEY ? { jwtKey: config.CLERK_JWT_KEY.replace(/\\n/g, '\n') } : {}),
    };
  }

  /**
   * Browser sessions carry azp (the site that obtained the token) and must be one of
   * ours. Native apps send no azp, so we check it here instead of passing
   * `authorizedParties` to Clerk, which would reject tokens without it.
   */
  private allowedParty(azp: unknown): boolean {
    if (azp === undefined || azp === null || azp === '') return true;
    return typeof azp === 'string' && this.parties.includes(azp);
  }

  /** Returns the claims, or null when the token is invalid or expired. */
  async verify(token: string): Promise<VerifiedToken | null> {
    try {
      // Returns the claims; throws on a bad signature, expiry or wrong key.
      const data = await verifyToken(token, this.options);
      if (!data?.sub || !this.allowedParty(data.azp)) return null;
      const claim = (name: string) => (typeof data[name] === 'string' && data[name] ? (data[name] as string) : undefined);
      // fva = [minutes since first factor, minutes since second factor]; -1 = never in this session.
      const secondFactorAge = Array.isArray(data.fva) ? data.fva[1] : -1;
      return {
        sub: data.sub,
        email: claim('email'),
        phone: claim('phone'),
        aal: typeof secondFactorAge === 'number' && secondFactorAge >= 0 ? 'aal2' : 'aal1',
      };
    } catch {
      return null;
    }
  }
}
