import type { ClientApp, DevicePlatform } from '@abaya/contracts';
import type { Channel } from '../../domain/notification.rules';

// ───────────── What gets stored in Notification.payload, per channel ─────────────

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** A pre-approved WhatsApp template (business-initiated messages must use templates). */
export interface WhatsAppPayload {
  phone: string; // 10-digit Indian mobile
  template: string; // our template name, e.g. "order_update"
  language: 'en' | 'hi';
  params: string[]; // body variables {{1}}, {{2}}, ...
}

/** Push goes to every current install of `app` for the user; tokens are looked up at send time. */
export interface PushPayload {
  app: ClientApp;
  title: string;
  body: string;
  /** Deep link the app opens on tap, e.g. "abaya://orders/AB-2026-000123". */
  url: string;
}

export type ChannelPayload = { EMAIL: EmailPayload; WHATSAPP: WhatsAppPayload; PUSH: PushPayload };

export interface OutgoingNotification<C extends Channel = Channel> {
  userId: string;
  channel: C;
  template: string;
  payload: ChannelPayload[C];
  dedupeKey?: string;
}

// ───────────── Senders (infrastructure implements them) ─────────────

/** Thrown by a sender when retrying cannot help (bad number, template not approved...). */
export class PermanentSendError extends Error {}

export interface SendContext {
  userId: string | null;
}

export interface ChannelSender<C extends Channel = Channel> {
  readonly channel: C;
  readonly enabled: boolean;
  send(payload: ChannelPayload[C], ctx: SendContext): Promise<void>;
}
export const EMAIL_CHANNEL = Symbol('EMAIL_CHANNEL');
export const WHATSAPP_CHANNEL = Symbol('WHATSAPP_CHANNEL');
export const PUSH_CHANNEL = Symbol('PUSH_CHANNEL');

// ───────────── Storage ─────────────

export interface ClaimedNotification {
  id: string;
  userId: string | null;
  channel: Channel;
  template: string;
  payload: unknown;
  attempts: number;
}

export interface NotificationOutbox {
  /** Queue messages; ones whose dedupeKey already exists are skipped. */
  enqueue(items: OutgoingNotification[]): Promise<number>;
  /** Lease up to `limit` due messages (safe with several API instances). */
  claimDue(limit: number): Promise<ClaimedNotification[]>;
  markSent(id: string): Promise<void>;
  markRetry(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  deleteForUser(userId: string): Promise<void>;
}
export const NOTIFICATION_OUTBOX = Symbol('NOTIFICATION_OUTBOX');

export interface DeviceRepository {
  upsert(userId: string, input: { token: string; platform: DevicePlatform; app: ClientApp }): Promise<void>;
  remove(userId: string, token: string): Promise<void>;
  tokensFor(userId: string, app: ClientApp): Promise<string[]>;
  removeTokens(tokens: string[]): Promise<void>;
  deleteForUser(userId: string): Promise<void>;
}
export const DEVICE_REPOSITORY = Symbol('DEVICE_REPOSITORY');
