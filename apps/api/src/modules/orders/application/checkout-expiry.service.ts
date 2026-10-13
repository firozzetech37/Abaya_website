import { UploadsService } from '../../media/application/uploads.service';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { CHECKOUT_EXPIRY_HOURS } from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { ORDER_REPOSITORY, type OrderRepository } from './ports/orders.ports';

const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Closes checkouts that were never paid: an order still awaiting payment 24 hours after it was
 * created becomes CANCELLED with no placedAt ("payment not completed"). It never reached the
 * workshop and is not counted anywhere. A payment that still arrives later is accepted
 * (OrderRepository.markPaid revives it). Safe with several API instances: each order is
 * moved with a guarded update, so it is cancelled once.
 */
/** How long after delivery (or cancellation) an order item's AI preview copy is kept. */
export const AI_PREVIEW_KEEP_DAYS = 90;

@Injectable()
export class CheckoutExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutExpiryService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'CHECKOUT_EXPIRY_ENABLED'>,
    private readonly uploads: UploadsService,
  ) {}

  onModuleInit(): void {
    if (!this.config.CHECKOUT_EXPIRY_ENABLED) return;
    this.timer = setInterval(() => void this.runOnce().catch((e) => this.logger.warn({ err: e }, 'Checkout expiry failed')), SWEEP_EVERY_MS);
    this.timer.unref();
    // Also once shortly after start, so a restart does not delay it by an hour.
    setTimeout(() => void this.runOnce().catch(() => undefined), 30_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Close every checkout older than the limit; returns how many were closed. */
  async runOnce(now = new Date()): Promise<number> {
    const olderThan = new Date(now.getTime() - CHECKOUT_EXPIRY_HOURS * 3_600_000);
    const ids = await this.orders.expireUnpaid(olderThan);
    let closed = 0;
    for (const id of ids) {
      const done = await this.orders.setStatus(
        id,
        ['PENDING_PAYMENT'],
        'CANCELLED',
        {
          actorUserId: null,
          action: 'order.cancelled',
          entityType: 'Order',
          entityId: id,
          after: { status: 'CANCELLED', reason: `payment not completed within ${CHECKOUT_EXPIRY_HOURS} hours` },
        },
        { cancellationNote: 'Payment not completed' },
      );
      if (done) closed += 1;
    }
    if (closed > 0) this.logger.log({ closed }, 'Closed unpaid checkouts');
    await this.deleteOldAiPreviews(now).catch((e: unknown) => this.logger.warn({ err: e instanceof Error ? e.message : e }, 'Could not delete old AI previews'));
    return closed;
  }

  /**
   * The customer's AI preview kept with an order item is deleted 90 days after the item was
   * delivered or cancelled (time enough for alterations and returns). Returns how many.
   */
  async deleteOldAiPreviews(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - AI_PREVIEW_KEEP_DAYS * 86_400_000);
    const old = await this.orders.listOldAiPreviews(before, 200);
    if (old.length === 0) return 0;
    await this.uploads.removeUploads('ORDER_AI_PREVIEW', [...new Set(old.map((o) => o.path))]);
    await this.orders.clearAiPreviews(old.map((o) => o.itemId));
    return old.length;
  }
}
