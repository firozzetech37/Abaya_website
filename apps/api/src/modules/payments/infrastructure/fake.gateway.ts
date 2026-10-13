import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PaymentGateway } from '../application/ports/payments.ports';

/**
 * DEVELOPMENT ONLY (PAYMENT_PROVIDER=fake; refused in production by parseEnv).
 * No money moves: orders are "paid" with the Simulate payment button, which goes
 * through the same capture path as a real Razorpay payment.
 */
@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  readonly keyId = 'test_mode';
  readonly mode = 'test' as const;
  readonly canSimulate: boolean = true;

  async createOrder() {
    return { id: `test_order_${randomUUID().replace(/-/g, '').slice(0, 14)}` };
  }

  /** Real Razorpay signatures never apply here; use PaymentsService.simulateCapture. */
  verifyPaymentSignature(): boolean {
    return false;
  }

  verifyWebhookSignature(): boolean {
    return false;
  }

  async refund() {
    return { id: `test_rfnd_${randomUUID().replace(/-/g, '').slice(0, 14)}`, status: 'processed' as const };
  }
}

/**
 * A live site before ordering opens (PAYMENT_PROVIDER=fake, NODE_ENV=production, ordering off):
 * no Razorpay and nothing to pay. Payments cannot be started or simulated.
 */
export class ClosedPaymentGateway extends FakePaymentGateway {
  override readonly canSimulate = false;

  override async createOrder(): Promise<{ id: string }> {
    throw new Error('Payments are off while ordering is closed.');
  }
}
