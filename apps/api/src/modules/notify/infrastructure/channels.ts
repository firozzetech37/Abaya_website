import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import {
  type ChannelSender,
  DEVICE_REPOSITORY,
  type DeviceRepository,
  type EmailPayload,
  PermanentSendError,
  type PushPayload,
  type SendContext,
  type WhatsAppPayload,
} from '../application/ports/notify.ports';

/** 4xx (except timeout/rate limit) means retrying cannot help. */
async function failFor(provider: string, res: Response): Promise<never> {
  const detail = (await res.text().catch(() => '')).slice(0, 300);
  const message = `${provider} responded ${res.status}${detail ? `: ${detail}` : ''}`;
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    throw new PermanentSendError(message);
  }
  throw new Error(message);
}

// ───────────── Email: Resend ─────────────

@Injectable()
export class ResendEmailChannel implements ChannelSender<'EMAIL'> {
  readonly channel = 'EMAIL' as const;
  private readonly apiKey?: string;
  private readonly from: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.apiKey = config.RESEND_API_KEY;
    this.from = config.EMAIL_FROM;
  }

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async send(p: EmailPayload): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [p.to], subject: p.subject, html: p.html, text: p.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) await failFor('Resend', res);
  }
}

// ───────────── WhatsApp: Interakt or Gupshup (WHATSAPP_PROVIDER) ─────────────

@Injectable()
export class WhatsAppChannel implements ChannelSender<'WHATSAPP'> {
  readonly channel = 'WHATSAPP' as const;
  private readonly templateIds: Record<string, string>;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.templateIds = config.WHATSAPP_TEMPLATE_IDS ? (JSON.parse(config.WHATSAPP_TEMPLATE_IDS) as Record<string, string>) : {};
  }

  get enabled(): boolean {
    return this.config.WHATSAPP_PROVIDER !== 'none';
  }

  send(p: WhatsAppPayload): Promise<void> {
    return this.config.WHATSAPP_PROVIDER === 'gupshup' ? this.sendGupshup(p) : this.sendInterakt(p);
  }

  /** https://www.interakt.shop/resource-center/send-template-message-api */
  private async sendInterakt(p: WhatsAppPayload): Promise<void> {
    const res = await fetch('https://api.interakt.ai/v1/public/message/', {
      method: 'POST',
      headers: { authorization: `Basic ${this.config.WHATSAPP_PROVIDER_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        countryCode: '+91',
        phoneNumber: p.phone,
        type: 'Template',
        template: { name: p.template, languageCode: p.language, bodyValues: p.params },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) await failFor('Interakt', res);
  }

  /** https://docs.gupshup.io/reference/msg — templates are addressed by id. */
  private async sendGupshup(p: WhatsAppPayload): Promise<void> {
    const id = this.templateIds[p.template];
    if (!id) throw new PermanentSendError(`No Gupshup template id for "${p.template}" in WHATSAPP_TEMPLATE_IDS`);
    const form = new URLSearchParams({
      channel: 'whatsapp',
      source: this.config.GUPSHUP_SOURCE_NUMBER ?? '',
      destination: `91${p.phone}`,
      'src.name': this.config.GUPSHUP_APP_NAME ?? '',
      template: JSON.stringify({ id, params: p.params }),
    });
    const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
      method: 'POST',
      headers: { apikey: this.config.WHATSAPP_PROVIDER_API_KEY ?? '', 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) await failFor('Gupshup', res);
  }
}

// ───────────── Push: Expo push service ─────────────

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

@Injectable()
export class ExpoPushChannel implements ChannelSender<'PUSH'> {
  readonly channel = 'PUSH' as const;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
  ) {}

  get enabled(): boolean {
    return this.config.PUSH_ENABLED;
  }

  /** Sends to every install of the app; removes tokens Expo reports as no longer registered. */
  async send(p: PushPayload, ctx: SendContext): Promise<void> {
    if (!ctx.userId) return;
    const tokens = await this.devices.tokensFor(ctx.userId, p.app);
    if (tokens.length === 0) return; // app not installed or notifications off: nothing to do

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.config.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${this.config.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(
        tokens.map((to) => ({ to, title: p.title, body: p.body, data: { url: p.url }, sound: 'default', channelId: 'default' })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) await failFor('Expo push', res);

    const tickets = ((await res.json()) as { data?: ExpoTicket[] }).data ?? [];
    const dead = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
    await this.devices.removeTokens(dead);
    const errors = tickets.filter((t, i) => t.status === 'error' && !dead.includes(tokens[i]!));
    if (errors.length === tokens.length - dead.length && errors.length > 0) {
      throw new Error(`Expo push rejected: ${errors[0]?.message ?? 'unknown error'}`);
    }
  }
}
