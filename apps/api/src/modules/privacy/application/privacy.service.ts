import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Actor, AUTH_PROVIDER_ADMIN, type AuthProviderAdmin } from '../../../common/auth/auth.types';
import { BusinessRuleError } from '../../../common/errors/domain-error';
import { CustomerService } from '../../customer/application/customer.service';
import { IdentityService } from '../../identity/application/identity.service';
import { DevicesService } from '../../notify/application/devices.service';
import { NotifyService } from '../../notify/application/notify.service';
import { OrdersService } from '../../orders/application/orders.service';

/**
 * DPDP Act 2023 data rights: access (export) and erasure (delete account).
 * Orders are kept for tax records with personal details removed.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly identity: IdentityService,
    private readonly customer: CustomerService,
    private readonly orders: OrdersService,
    private readonly notify: NotifyService,
    private readonly devices: DevicesService,
    @Inject(AUTH_PROVIDER_ADMIN) private readonly auth: AuthProviderAdmin,
  ) {}

  async export(userId: string): Promise<Record<string, unknown>> {
    const [identity, customer, orders] = await Promise.all([
      this.identity.exportForUser(userId),
      this.customer.exportForUser(userId),
      this.orders.exportForUser(userId),
    ]);
    return { exportedAt: new Date().toISOString(), ...identity, ...customer, orders };
  }

  async deleteAccount(actor: Actor & { authUserId: string }): Promise<void> {
    if (await this.orders.hasActiveOrders(actor.userId)) {
      throw new BusinessRuleError(
        'ACTIVE_ORDERS',
        'You have an order being made. You can delete your account once it is delivered, or contact support.',
      );
    }
    await this.customer.deleteForUser(actor.userId);
    await this.orders.anonymiseForUser(actor.userId);
    await this.devices.deleteForUser(actor.userId);
    await this.notify.deleteForUser(actor.userId); // queued messages hold email/phone
    await this.identity.scrub(actor.userId, {
      actorUserId: actor.userId,
      action: 'user.deleted',
      entityType: 'User',
      entityId: actor.userId,
      ip: actor.ip,
    });
    try {
      await this.auth.deleteUser(actor.authUserId);
    } catch (e) {
      // Our data is already erased and the account is deactivated; the login row can be removed by hand.
      this.logger.error({ userId: actor.userId, err: e }, 'Could not delete the Clerk user');
    }
  }
}
