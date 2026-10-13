import { Inject, Injectable } from '@nestjs/common';
import type {
  OrderPaidEvent,
  OrderStageChangedEvent,
  RefundProcessedEvent,
} from '../../../common/events/events';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { type UserContact, IdentityService } from '../../identity/application/identity.service';
import { OrdersService } from '../../orders/application/orders.service';
import {
  type Channel,
  customerChannelsForStage,
  indianMobileDigits,
} from '../domain/notification.rules';
import { NotificationDispatcher } from './notification-dispatcher.service';
import {
  type ChannelSender,
  EMAIL_CHANNEL,
  type EmailPayload,
  NOTIFICATION_OUTBOX,
  type NotificationOutbox,
  type OutgoingNotification,
  PUSH_CHANNEL,
  type PushPayload,
  WHATSAPP_CHANNEL,
  type WhatsAppPayload,
} from './ports/notify.ports';
import {
  type EmailContent,
  orderPlacedEmail,
  orderPlacedPush,
  orderPlacedWhatsApp,
  refundEmail,
  refundPush,
  refundWhatsApp,
  stageChangedEmail,
  stageChangedPush,
  stageChangedWhatsApp,
} from './templates';

interface Builders {
  email: () => EmailContent;
  whatsapp: (phone: string) => WhatsAppPayload;
  push: () => PushPayload;
}

/**
 * Turns domain events into outbox rows — one per channel the customer can
 * receive — then wakes the dispatcher. Queuing is fast and happens inside the
 * request; sending and retries happen in NotificationDispatcher.
 *
 * Email: when the user has an email. WhatsApp: only after the customer opted in
 * (WHATSAPP_UPDATES consent) and has a valid Indian mobile. Push: always queued;
 * sent to whatever app installs the user has.
 */
@Injectable()
export class NotifyService {
  private readonly webUrl: string;

  constructor(
    @Inject(NOTIFICATION_OUTBOX) private readonly outbox: NotificationOutbox,
    @Inject(EMAIL_CHANNEL) private readonly email: ChannelSender<'EMAIL'>,
    @Inject(WHATSAPP_CHANNEL) private readonly whatsapp: ChannelSender<'WHATSAPP'>,
    @Inject(PUSH_CHANNEL) private readonly push: ChannelSender<'PUSH'>,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly dispatcher: NotificationDispatcher,
    private readonly identity: IdentityService,
    private readonly orders: OrdersService,
  ) {
    this.webUrl = config.WEB_PUBLIC_URL;
  }

  async orderPaid(e: OrderPaidEvent): Promise<void> {
    const user = await this.identity.getContact(e.userId);
    const input = { name: user?.name ?? null, orderNumber: e.orderNumber, totalInPaise: e.totalInPaise, webUrl: this.webUrl };
    await this.queueForCustomer(e.userId, user, 'order.placed', ['EMAIL', 'WHATSAPP', 'PUSH'], `order.placed:${e.orderId}`, {
      email: () => orderPlacedEmail(input),
      whatsapp: (phone) => orderPlacedWhatsApp(input, phone),
      push: () => orderPlacedPush(input),
    });
  }

  async stageChanged(e: OrderStageChangedEvent): Promise<void> {
    const channels = customerChannelsForStage(e.from, e.to);
    if (channels.length > 0) {
      const user = await this.identity.getContact(e.userId);
      const input = { name: user?.name ?? null, orderNumber: e.orderNumber, designName: e.designName, to: e.to, note: e.note, webUrl: this.webUrl };
      await this.queueForCustomer(e.userId, user, 'order.stage_changed', channels, undefined, {
        email: () => stageChangedEmail(input),
        whatsapp: (phone) => stageChangedWhatsApp(input, phone),
        push: () => stageChangedPush(input),
      });
    }

  }

  async refundProcessed(e: RefundProcessedEvent): Promise<void> {
    const order = await this.orders.getOrder(e.orderId);
    const user = await this.identity.getContact(order.userId);
    const input = { name: user?.name ?? null, orderNumber: order.orderNumber, amountInPaise: e.amountInPaise, webUrl: this.webUrl };
    await this.queueForCustomer(order.userId, user, 'order.refunded', ['EMAIL', 'WHATSAPP', 'PUSH'], `order.refunded:${e.refundId}`, {
      email: () => refundEmail(input),
      whatsapp: (phone) => refundWhatsApp(input, phone),
      push: () => refundPush(input),
    });
  }

  /** DPDP erasure: queued messages contain contact details. */
  deleteForUser(userId: string): Promise<void> {
    return this.outbox.deleteForUser(userId);
  }

  private async queueForCustomer(
    userId: string,
    user: UserContact | null,
    template: string,
    channels: Channel[],
    dedupeBase: string | undefined,
    build: Builders,
  ): Promise<void> {
    const items: OutgoingNotification[] = [];
    const key = (c: Channel) => (dedupeBase ? `${dedupeBase}:${c}` : undefined);

    if (channels.includes('EMAIL') && this.email.enabled && user?.email) {
      const content = build.email();
      const payload: EmailPayload = { to: user.email, ...content };
      items.push({ userId, channel: 'EMAIL', template, payload, dedupeKey: key('EMAIL') });
    }
    const phone = indianMobileDigits(user?.phone);
    if (channels.includes('WHATSAPP') && this.whatsapp.enabled && phone && (await this.identity.hasConsent(userId, 'WHATSAPP_UPDATES'))) {
      items.push({ userId, channel: 'WHATSAPP', template, payload: build.whatsapp(phone), dedupeKey: key('WHATSAPP') });
    }
    if (channels.includes('PUSH') && this.push.enabled) {
      items.push({ userId, channel: 'PUSH', template, payload: build.push(), dedupeKey: key('PUSH') });
    }
    await this.enqueue(items);
  }

  private async enqueue(items: OutgoingNotification[]): Promise<void> {
    if (items.length === 0) return;
    if ((await this.outbox.enqueue(items)) > 0) this.dispatcher.kick();
  }
}
