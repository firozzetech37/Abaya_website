import { Inject, Injectable } from '@nestjs/common';
import type { AdminWaitlistDto, OrderingStatusDto, OrderingWaitlistDto } from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { BusinessRuleError } from '../../../common/errors/domain-error';
import { IdentityService } from '../../identity/application/identity.service';

/** Port: who asked to be told when ordering opens. */
export interface WaitlistRepository {
  join(userId: string): Promise<Date>;
  joinedAt(userId: string): Promise<Date | null>;
  list(query: { cursor?: string; limit: number }): Promise<{ items: { userId: string; createdAt: Date }[]; nextCursor: string | null }>;
  count(): Promise<number>;
}
export const WAITLIST_REPOSITORY = Symbol('WAITLIST_REPOSITORY');

export const ORDERING_CLOSED_MESSAGE = 'Ordering opens soon. For now, design yours and see it with AI.';

/**
 * "Ordering coming soon": while ORDERING_ENABLED is off the bag, checkout and HD downloads are
 * closed (previews and try-ons still work) and customers can ask to be told when they open.
 */
@Injectable()
export class OrderingService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'ORDERING_ENABLED'>,
    @Inject(WAITLIST_REPOSITORY) private readonly waitlist: WaitlistRepository,
    private readonly identity: IdentityService,
  ) {}

  status(): OrderingStatusDto {
    return { orderingEnabled: this.config.ORDERING_ENABLED };
  }

  /** Throws while ordering is closed (bag, checkout, HD downloads). */
  assertOpen(): void {
    if (!this.config.ORDERING_ENABLED) throw new BusinessRuleError('ORDERING_CLOSED', ORDERING_CLOSED_MESSAGE);
  }

  async mine(userId: string): Promise<OrderingWaitlistDto> {
    const at = await this.waitlist.joinedAt(userId);
    return { joined: Boolean(at), joinedAt: at?.toISOString() ?? null };
  }

  /** Idempotent: joining twice keeps the first date. */
  async join(userId: string): Promise<OrderingWaitlistDto> {
    const at = await this.waitlist.join(userId);
    return { joined: true, joinedAt: at.toISOString() };
  }

  async list(query: { cursor?: string; limit: number }): Promise<AdminWaitlistDto> {
    const [page, total] = await Promise.all([this.waitlist.list(query), this.waitlist.count()]);
    const people = await this.identity.getContacts(page.items.map((i) => i.userId));
    return {
      total,
      nextCursor: page.nextCursor,
      items: page.items.map((i) => {
        const p = people.get(i.userId);
        return { userId: i.userId, name: p?.name ?? null, email: p?.email ?? null, phone: p?.phone ?? null, joinedAt: i.createdAt.toISOString() };
      }),
    };
  }
}
