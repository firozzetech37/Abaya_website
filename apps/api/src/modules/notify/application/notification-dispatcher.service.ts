import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { type Channel, nextAttemptAfterFailure } from '../domain/notification.rules';
import {
  type ChannelPayload,
  type ChannelSender,
  type ClaimedNotification,
  EMAIL_CHANNEL,
  NOTIFICATION_OUTBOX,
  type NotificationOutbox,
  PermanentSendError,
  PUSH_CHANNEL,
  WHATSAPP_CHANNEL,
} from './ports/notify.ports';

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 25;

export interface DispatchResult {
  sent: number;
  retried: number;
  failed: number;
}

/**
 * Sends queued notifications. Rows are leased with FOR UPDATE SKIP LOCKED, so
 * several API instances can run this safely; a crashed send is retried after
 * the lease expires. Failures back off (1 min … 6 h) before giving up.
 */
@Injectable()
export class NotificationDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private readonly senders: Record<Channel, ChannelSender>;
  private timer?: NodeJS.Timeout;
  private running = false;
  private again = false;

  constructor(
    @Inject(NOTIFICATION_OUTBOX) private readonly outbox: NotificationOutbox,
    @Inject(EMAIL_CHANNEL) email: ChannelSender<'EMAIL'>,
    @Inject(WHATSAPP_CHANNEL) whatsapp: ChannelSender<'WHATSAPP'>,
    @Inject(PUSH_CHANNEL) push: ChannelSender<'PUSH'>,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'NOTIFY_WORKER_ENABLED'>,
  ) {
    this.senders = { EMAIL: email, WHATSAPP: whatsapp, PUSH: push } as Record<Channel, ChannelSender>;
  }

  onModuleInit(): void {
    if (!this.config.NOTIFY_WORKER_ENABLED) return;
    this.timer = setInterval(() => this.kick(), POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Send soon, without blocking the caller. No-op when the worker is disabled (tests call runOnce). */
  kick(): void {
    if (!this.config.NOTIFY_WORKER_ENABLED) return;
    if (this.running) {
      this.again = true;
      return;
    }
    setImmediate(() => void this.drain());
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      do {
        this.again = false;
        const result = await this.runOnce();
        if (result.sent + result.retried + result.failed === BATCH_SIZE) this.again = true;
      } while (this.again);
    } catch (e) {
      this.logger.error({ err: e }, 'Notification worker failed');
    } finally {
      this.running = false;
    }
  }

  /** Process one batch of due notifications. */
  async runOnce(now = new Date()): Promise<DispatchResult> {
    const batch = await this.outbox.claimDue(BATCH_SIZE);
    const result: DispatchResult = { sent: 0, retried: 0, failed: 0 };
    for (const n of batch) result[await this.sendOne(n, now)] += 1;
    return result;
  }

  private async sendOne(n: ClaimedNotification, now: Date): Promise<keyof DispatchResult> {
    const sender = this.senders[n.channel];
    if (!sender?.enabled) {
      await this.outbox.markFailed(n.id, `${n.channel} is not configured`);
      return 'failed';
    }
    try {
      await sender.send(n.payload as ChannelPayload[typeof n.channel], { userId: n.userId });
      await this.outbox.markSent(n.id);
      return 'sent';
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const next = e instanceof PermanentSendError ? null : nextAttemptAfterFailure(n.attempts, now);
      if (next) {
        await this.outbox.markRetry(n.id, next, message);
        return 'retried';
      }
      this.logger.warn({ notificationId: n.id, channel: n.channel, template: n.template, error: message }, 'Notification failed');
      await this.outbox.markFailed(n.id, message);
      return 'failed';
    }
  }
}
