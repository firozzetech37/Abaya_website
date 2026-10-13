import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PaymentDto } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError, DomainError, NotFoundError } from '../../../common/errors/domain-error';
import { EVENT_PUBLISHER, EVENTS, type EventPublisher } from '../../../common/events/events';
import { assertRefundAllowed, statusAfterRefund } from '../domain/refund.rules';
import {
  PAYMENT_GATEWAY,
  PAYMENT_REPOSITORY,
  type PaymentGateway,
  type PaymentRecord,
  type PaymentRepository,
} from './ports/payments.ports';

class InvalidSignatureError extends DomainError {
  constructor() {
    super('VALIDATION', 'INVALID_SIGNATURE', 'Payment could not be verified.');
  }
}

/** Razorpay webhook payload (only the fields we read). */
interface WebhookPayload {
  event: string;
  payload?: {
    payment?: { entity?: { id: string; order_id: string; amount: number; method?: string; status?: string } };
    refund?: { entity?: { id: string; payment_id: string; amount: number; status?: string } };
  };
}

const refundedTotal = (p: PaymentRecord) =>
  p.refunds.filter((r) => r.status !== 'FAILED').reduce((sum, r) => sum + r.amountInPaise, 0);

/** Payments' exported application service (docs/apps/api.md). */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  /** Creates the provider order for a new Order and records a CREATED payment. */
  async createForOrder(order: { id: string; orderNumber: string; totalInPaise: number }) {
    const providerOrder = await this.gateway.createOrder({
      amountInPaise: order.totalInPaise,
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });
    await this.payments.create({ orderId: order.id, providerOrderId: providerOrder.id, amountInPaise: order.totalInPaise });
    return {
      razorpay: { keyId: this.gateway.keyId, orderId: providerOrder.id, amount: order.totalInPaise, currency: 'INR' as const },
      paymentMode: this.gateway.mode,
    };
  }

  /** Provider order for an HD design download (its own purchase, never an abaya order). */
  async createForDownload(download: { id: string; receipt: string; amountInPaise: number }) {
    const providerOrder = await this.gateway.createOrder({
      amountInPaise: download.amountInPaise,
      receipt: download.receipt,
      notes: { downloadId: download.id, kind: 'design_download' },
    });
    await this.payments.create({ downloadId: download.id, providerOrderId: providerOrder.id, amountInPaise: download.amountInPaise });
    return {
      razorpay: { keyId: this.gateway.keyId, orderId: providerOrder.id, amount: download.amountInPaise, currency: 'INR' as const },
      paymentMode: this.gateway.mode,
    };
  }

  /** Development only: "Simulate payment" for a download (same capture path as Razorpay). */
  async simulateDownloadCapture(downloadId: string): Promise<void> {
    if (this.gateway.mode !== 'test' || this.gateway.canSimulate === false) throw new NotFoundError('Payment');
    await this.simulate(await this.payments.listForDownload(downloadId));
  }

  /** Tells checkout pages whether to open Razorpay or show the test-mode button. */
  config(): { mode: 'razorpay' | 'test' } {
    return { mode: this.gateway.mode };
  }

  /**
   * Development only: mark an order's pending payment as captured without any
   * provider, through the same capture path (event → order PAID) as a real payment.
   * Callers must check the order belongs to the customer (orders module does).
   */
  async simulateCapture(orderId: string): Promise<void> {
    if (this.gateway.mode !== 'test' || this.gateway.canSimulate === false) throw new NotFoundError('Payment');
    await this.simulate(await this.payments.listForOrder(orderId));
  }

  private async simulate(payments: PaymentRecord[]): Promise<void> {
    // The newest waiting payment (a customer may have started paying more than once).
    const payment = [...payments].reverse().find((p) => p.status === 'CREATED' || p.status === 'FAILED');
    if (!payment) throw new BusinessRuleError('NOTHING_TO_PAY', 'This order has no payment waiting.');
    await this.capture(payment, {
      providerPaymentId: `test_pay_${payment.id.replace(/-/g, '').slice(0, 14)}`,
      method: 'test',
      amountInPaise: payment.amountInPaise,
    });
  }

  /** Client-side success callback. The signature proves Razorpay confirmed this payment. */
  async verifyClientPayment(input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
    if (!this.gateway.verifyPaymentSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
      throw new InvalidSignatureError();
    }
    const payment = await this.payments.findByProviderOrderId(input.razorpayOrderId);
    if (!payment) throw new NotFoundError('Payment');
    await this.capture(payment, { providerPaymentId: input.razorpayPaymentId, method: null, amountInPaise: payment.amountInPaise });
    return { orderId: payment.orderId, downloadId: payment.downloadId, status: 'CAPTURED' as const };
  }

  /** POST /v1/payments/webhook. Signature is checked over the raw bytes before anything else. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ ok: true }> {
    if (!rawBody || !signature || !this.gateway.verifyWebhookSignature(rawBody, signature)) {
      throw new InvalidSignatureError();
    }
    const body = JSON.parse(rawBody.toString('utf8')) as WebhookPayload;
    const payment = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;

    switch (body.event) {
      case 'payment.captured': {
        if (!payment) break;
        const record = await this.payments.findByProviderOrderId(payment.order_id);
        if (!record) {
          this.logger.warn({ providerOrderId: payment.order_id }, 'Webhook for unknown order');
          break;
        }
        await this.capture(record, {
          providerPaymentId: payment.id,
          method: payment.method ?? null,
          amountInPaise: payment.amount,
          raw: body,
        });
        break;
      }
      case 'payment.failed': {
        if (!payment) break;
        const record = await this.payments.findByProviderOrderId(payment.order_id);
        if (record && record.status === 'CREATED') await this.payments.markFailed(record.id, body);
        break;
      }
      case 'refund.processed':
      case 'refund.failed': {
        if (!refund) break;
        const updated = await this.payments.updateRefundStatus(
          refund.id,
          body.event === 'refund.processed' ? 'PROCESSED' : 'FAILED',
        );
        if (updated?.status === 'PROCESSED') await this.announceRefund(updated.paymentId, updated.id, updated.amountInPaise);
        break;
      }
      default:
        // Other events (order.paid, payment.authorized...) need no action.
        break;
    }
    return { ok: true };
  }

  /** Throws exactly as refund() would, without moving money (lets callers validate first). */
  async assertRefundable(actor: Actor, orderId: string, amountInPaise: number): Promise<void> {
    await this.refundablePayment(actor, orderId, amountInPaise);
  }

  async refund(actor: Actor, orderId: string, amountInPaise: number, reason: string): Promise<PaymentDto> {
    const { payment, already } = await this.refundablePayment(actor, orderId, amountInPaise);
    const result = await this.gateway.refund({
      providerPaymentId: payment.providerPaymentId,
      amountInPaise,
      notes: { orderId, reason: reason.slice(0, 250) },
    });
    const status = result.status === 'processed' ? 'PROCESSED' : result.status === 'failed' ? 'FAILED' : 'PENDING';
    const refund = await this.payments.createRefund(
      payment.id,
      { amountInPaise, reason, createdById: actor.userId, providerRefundId: result.id, status },
      statusAfterRefund(payment.amountInPaise, already + (status === 'FAILED' ? 0 : amountInPaise)),
      {
        actorUserId: actor.userId,
        action: 'refund.created',
        entityType: 'Order',
        entityId: orderId,
        after: { paymentId: payment.id, amountInPaise, reason, status },
        ip: actor.ip,
      },
    );
    if (status === 'FAILED') throw new BusinessRuleError('REFUND_FAILED', 'The payment provider rejected this refund.');
    if (status === 'PROCESSED') await this.announceRefund(payment.id, refund.id, amountInPaise);
    return this.toDto((await this.payments.findById(payment.id))!);
  }

  private async refundablePayment(actor: Actor, orderId: string, amountInPaise: number) {
    const payment = (await this.payments.listForOrder(orderId)).find(
      (p) => p.status === 'CAPTURED' || p.status === 'PARTIALLY_REFUNDED',
    );
    if (!payment?.providerPaymentId) {
      throw new BusinessRuleError('PAYMENT_NOT_CAPTURED', 'This order has no captured payment to refund.');
    }
    const already = refundedTotal(payment);
    assertRefundAllowed({
      roles: actor.roles,
      amountInPaise,
      paymentStatus: payment.status,
      capturedInPaise: payment.amountInPaise,
      alreadyRefundedInPaise: already,
    });
    return { payment: payment as PaymentRecord & { providerPaymentId: string }, already };
  }

  async listForOrder(orderId: string): Promise<PaymentDto[]> {
    return (await this.payments.listForOrder(orderId)).map((p) => this.toDto(p));
  }

  private async capture(
    payment: PaymentRecord,
    input: { providerPaymentId: string; method: string | null; amountInPaise: number; raw?: unknown },
  ): Promise<void> {
    if (input.amountInPaise !== payment.amountInPaise) {
      // Never mark an order paid for a different amount; needs a human to look at it.
      this.logger.error(
        { paymentId: payment.id, expected: payment.amountInPaise, received: input.amountInPaise },
        'Captured amount does not match the order total',
      );
      throw new BusinessRuleError('AMOUNT_MISMATCH', 'Payment amount does not match the order.');
    }
    await this.payments.markCaptured(payment.id, input);
    // Published even when the other path captured first: the orders handler is
    // idempotent, so a webhook retry repairs a handler that failed earlier.
    await this.events.publish(EVENTS.PaymentCaptured, {
      orderId: payment.orderId,
      downloadId: payment.downloadId,
      paymentId: payment.id,
      providerPaymentId: input.providerPaymentId,
      amountInPaise: payment.amountInPaise,
    });
  }

  private async announceRefund(paymentId: string, refundId: string, amountInPaise: number): Promise<void> {
    const payment = await this.payments.findById(paymentId);
    // Downloads are not refunded through orders (no order to update).
    if (!payment?.orderId) return;
    await this.events.publish(EVENTS.RefundProcessed, {
      orderId: payment.orderId,
      refundId,
      amountInPaise,
      fullyRefunded: refundedTotal(payment) >= payment.amountInPaise,
    });
  }

  private toDto(p: PaymentRecord): PaymentDto {
    return {
      id: p.id,
      providerOrderId: p.providerOrderId,
      providerPaymentId: p.providerPaymentId,
      amountInPaise: p.amountInPaise,
      status: p.status,
      method: p.method,
      refundedInPaise: refundedTotal(p),
      refunds: p.refunds.map((r) => ({
        id: r.id,
        amountInPaise: r.amountInPaise,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      createdAt: p.createdAt.toISOString(),
    };
  }
}
