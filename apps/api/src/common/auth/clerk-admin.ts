import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { type ClerkClient, createClerkClient } from '@clerk/backend';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { UpstreamError } from '../errors/domain-error';
import { AUTH_PROVIDER_ADMIN, type AuthProviderAdmin } from './auth.types';

/** Clerk Backend API: read a new user's email/phone, delete a user (DPDP erasure). */
@Injectable()
export class ClerkAuthAdmin implements AuthProviderAdmin {
  private readonly clerk: ClerkClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.clerk = createClerkClient({ secretKey: config.CLERK_SECRET_KEY });
  }

  async getProfile(authUserId: string) {
    try {
      const user = await this.clerk.users.getUser(authUserId);
      const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;
      const phone = user.phoneNumbers.find((p) => p.id === user.primaryPhoneNumberId)?.phoneNumber;
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined;
      return { email, phone, name };
    } catch {
      throw new UpstreamError('AUTH_PROVIDER_ERROR', 'Could not load your account. Please try again.');
    }
  }

  async deleteUser(authUserId: string): Promise<void> {
    try {
      await this.clerk.users.deleteUser(authUserId);
    } catch (e) {
      // Already deleted at Clerk is fine.
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
}

@Global()
@Module({
  providers: [{ provide: AUTH_PROVIDER_ADMIN, useClass: ClerkAuthAdmin }],
  exports: [AUTH_PROVIDER_ADMIN],
})
export class AuthProviderModule {}
