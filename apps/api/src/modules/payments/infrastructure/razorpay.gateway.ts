import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { UpstreamError } from '../../../common/errors/domain-error';
import type { PaymentGateway } from '../application/ports/payments.ports';

const API = 'https://api.razorpay.com/v1';

function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Razorpay Orders + Refunds REST API and its documented HMAC-SHA256 signatures. */
@Injectable()
export class RazorpayGateway implements PaymentGateway {
  private readonly logger = new Logger(RazorpayGateway.name);
  readonly keyId: string;
  readonly mode = 'razorpay' as const;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    // Presence is checked by parseEnv when PAYMENT_PROVIDER=razorpay.
    this.keyId = config.RAZORPAY_KEY_ID ?? '';
    this.keySecret = config.RAZORPAY_KEY_SECRET ?? '';
    this.webhookSecret = config.RAZORPAY_WEBHOOK_SECRET ?? '';
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error({ status: res.status, path, detail: detail.slice(0, 500) }, 'Razorpay request failed');
      throw new UpstreamError('PAYMENT_PROVIDER_ERROR', 'The payment provider is unavailable. Please try again.');
    }
    return (await res.json()) as T;
  }

  async createOrder(input: { amountInPaise: number; receipt: string; notes: Record<string, string> }) {
    const order = await this.post<{ id: string }>('/orders', {
      amount: input.amountInPaise,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes,
    });
    return { id: order.id };
  }

  verifyPaymentSignature(providerOrderId: string, providerPaymentId: string, signature: string): boolean {
    const expected = createHmac('sha256', this.keySecret).update(`${providerOrderId}|${providerPaymentId}`).digest('hex');
    return safeEqualHex(expected, signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeEqualHex(expected, signature);
  }

  async refund(input: { providerPaymentId: string; amountInPaise: number; notes: Record<string, string> }) {
    const refund = await this.post<{ id: string; status: 'processed' | 'pending' | 'failed' }>(
      `/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
      { amount: input.amountInPaise, speed: 'normal', notes: input.notes },
    );
    return { id: refund.id, status: refund.status };
  }
}
