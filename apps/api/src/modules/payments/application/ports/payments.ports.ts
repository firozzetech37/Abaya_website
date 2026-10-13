import type { PaymentStatus, RefundStatus } from '@abaya/contracts';
import type { AuditEntry } from '../../../../common/audit/audit';

/** Payment provider (Razorpay today). Swapping providers touches only infrastructure/. */
export interface PaymentGateway {
  readonly keyId: string;
  /** 'test' for the development fake gateway: payments are simulated, never real. */
  readonly mode: 'razorpay' | 'test';
  /** False on a live site without Razorpay (ordering closed): the "Simulate payment" routes are off. */
  readonly canSimulate?: boolean;
  createOrder(input: { amountInPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ id: string }>;
  /** Signature Razorpay Checkout returns to the client after a successful payment. */
  verifyPaymentSignature(providerOrderId: string, providerPaymentId: string, signature: string): boolean;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  refund(input: {
    providerPaymentId: string;
    amountInPaise: number;
    notes: Record<string, string>;
  }): Promise<{ id: string; status: 'processed' | 'pending' | 'failed' }>;
}
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface RefundRecord {
  id: string;
  amountInPaise: number;
  reason: string;
  status: RefundStatus;
  providerRefundId: string | null;
  createdAt: Date;
}

export interface PaymentRecord {
  id: string;
  orderId: string | null;
  downloadId: string | null;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountInPaise: number;
  status: PaymentStatus;
  method: string | null;
  createdAt: Date;
  refunds: RefundRecord[];
}

export interface PaymentRepository {
  create(
    input: ({ orderId: string } | { downloadId: string }) & { providerOrderId: string; amountInPaise: number },
  ): Promise<PaymentRecord>;
  findByProviderOrderId(providerOrderId: string): Promise<PaymentRecord | null>;
  findById(id: string): Promise<PaymentRecord | null>;
  listForOrder(orderId: string): Promise<PaymentRecord[]>;
  listForDownload(downloadId: string): Promise<PaymentRecord[]>;
  /**
   * Atomically move CREATED/AUTHORIZED/FAILED → CAPTURED. Returns false when it was
   * already captured (webhook and client verify can both arrive; only one wins).
   */
  markCaptured(
    id: string,
    input: { providerPaymentId: string; method: string | null; raw?: unknown },
  ): Promise<boolean>;
  markFailed(id: string, raw?: unknown): Promise<void>;
  createRefund(
    paymentId: string,
    input: { amountInPaise: number; reason: string; createdById: string; providerRefundId: string; status: RefundStatus },
    newPaymentStatus: PaymentStatus,
    audit: AuditEntry,
  ): Promise<RefundRecord>;
  /** Webhook: refund.processed / refund.failed. Returns the refund when its status changed. */
  updateRefundStatus(providerRefundId: string, status: RefundStatus): Promise<(RefundRecord & { paymentId: string }) | null>;
}
export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
