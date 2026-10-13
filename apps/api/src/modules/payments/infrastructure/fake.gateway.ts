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
