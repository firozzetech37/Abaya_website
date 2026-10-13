import { Injectable } from '@nestjs/common';
import type { PaymentStatus, Prisma, RefundStatus } from '@abaya/db';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { PaymentRecord, PaymentRepository, RefundRecord } from '../application/ports/payments.ports';

const include = { refunds: { orderBy: { createdAt: 'asc' } } } satisfies Prisma.PaymentInclude;
type Row = Prisma.PaymentGetPayload<{ include: typeof include }>;

const toRefund = (r: Row['refunds'][number]): RefundRecord => ({
  id: r.id,
  amountInPaise: r.amountInPaise,
  reason: r.reason,
  status: r.status,
  providerRefundId: r.providerRefundId,
  createdAt: r.createdAt,
});

const toRecord = (p: Row): PaymentRecord => ({
  id: p.id,
  orderId: p.orderId,
  downloadId: p.downloadId,
  providerOrderId: p.providerOrderId,
  providerPaymentId: p.providerPaymentId,
  amountInPaise: p.amountInPaise,
  status: p.status,
  method: p.method,
  createdAt: p.createdAt,
  refunds: p.refunds.map(toRefund),
});

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly db: PrismaService) {}

  async create(input: Parameters<PaymentRepository['create']>[0]) {
    return toRecord(await this.db.payment.create({ data: input, include }));
  }

  async findByProviderOrderId(providerOrderId: string) {
    const row = await this.db.payment.findUnique({ where: { providerOrderId }, include });
    return row ? toRecord(row) : null;
  }

  async findById(id: string) {
    const row = await this.db.payment.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  }

  async listForOrder(orderId: string) {
    return (await this.db.payment.findMany({ where: { orderId }, include, orderBy: { createdAt: 'asc' } })).map(toRecord);
  }

  async listForDownload(downloadId: string) {
    return (await this.db.payment.findMany({ where: { downloadId }, include, orderBy: { createdAt: 'asc' } })).map(toRecord);
  }

  async markCaptured(id: string, input: { providerPaymentId: string; method: string | null; raw?: unknown }) {
    // Conditional update = idempotency: only one caller moves it to CAPTURED.
    const result = await this.db.payment.updateMany({
      where: { id, status: { in: ['CREATED', 'AUTHORIZED', 'FAILED'] } },
      data: {
        status: 'CAPTURED',
        providerPaymentId: input.providerPaymentId,
        ...(input.method ? { method: input.method } : {}),
        ...(input.raw !== undefined ? { raw: json(input.raw) } : {}),
      },
    });
    if (result.count === 0 && input.method) {
      // Client verify won the race; keep the method the webhook reports.
      await this.db.payment.updateMany({ where: { id, method: null }, data: { method: input.method } });
    }
    return result.count === 1;
  }

  async markFailed(id: string, raw?: unknown) {
    await this.db.payment.updateMany({ where: { id, status: 'CREATED' }, data: { status: 'FAILED', raw: json(raw) } });
  }

  async createRefund(
    paymentId: string,
    input: { amountInPaise: number; reason: string; createdById: string; providerRefundId: string; status: RefundStatus },
    newPaymentStatus: PaymentStatus,
    audit: AuditEntry,
  ) {
    return this.db.$transaction(async (tx) => {
      const refund = await tx.refund.create({ data: { ...input, paymentId } });
      await tx.payment.update({ where: { id: paymentId }, data: { status: newPaymentStatus } });
      await writeAudit(tx, audit);
      return toRefund(refund);
    });
  }

  async updateRefundStatus(providerRefundId: string, status: RefundStatus) {
    return this.db.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { providerRefundId } });
      if (!refund || refund.status === status) return null;
      const updated = await tx.refund.update({ where: { id: refund.id }, data: { status } });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId }, include });
      const refunded = payment.refunds.filter((r) => r.status !== 'FAILED').reduce((s, r) => s + r.amountInPaise, 0);
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: refunded >= payment.amountInPaise ? 'REFUNDED' : refunded > 0 ? 'PARTIALLY_REFUNDED' : 'CAPTURED',
        },
      });
      return { ...toRefund(updated), paymentId: refund.paymentId };
    });
  }
}
