import { type PaymentStatus, type Role, SUPPORT_REFUND_LIMIT_IN_PAISE } from '@abaya/contracts';
import { BusinessRuleError, ForbiddenError } from '../../../common/errors/domain-error';

/**
 * Refund rules (docs/domain-model.md §6): SUPPORT may refund up to ₹5,000 per
 * refund; larger refunds need SUPER_ADMIN. Never refund more than was captured.
 */
export function assertRefundAllowed(input: {
  roles: readonly Role[];
  amountInPaise: number;
  paymentStatus: PaymentStatus;
  capturedInPaise: number;
  alreadyRefundedInPaise: number;
}): void {
  const isAdmin = input.roles.includes('SUPER_ADMIN');
  if (!isAdmin && !input.roles.includes('SUPPORT')) {
    throw new ForbiddenError('Only support or a super admin can issue refunds.');
  }
  if (!isAdmin && input.amountInPaise > SUPPORT_REFUND_LIMIT_IN_PAISE) {
    throw new ForbiddenError('Refunds above ₹5,000 need a super admin.', 'REFUND_LIMIT_EXCEEDED');
  }
  if (input.paymentStatus !== 'CAPTURED' && input.paymentStatus !== 'PARTIALLY_REFUNDED') {
    throw new BusinessRuleError('PAYMENT_NOT_CAPTURED', 'This order has no captured payment to refund.');
  }
  const refundable = input.capturedInPaise - input.alreadyRefundedInPaise;
  if (input.amountInPaise > refundable) {
    throw new BusinessRuleError('REFUND_TOO_LARGE', 'The refund is larger than the amount left to refund.', {
      refundableInPaise: refundable,
    });
  }
}

/** Payment status after refunds totalling `refundedInPaise`. */
export const statusAfterRefund = (capturedInPaise: number, refundedInPaise: number): PaymentStatus =>
  refundedInPaise >= capturedInPaise ? 'REFUNDED' : refundedInPaise > 0 ? 'PARTIALLY_REFUNDED' : 'CAPTURED';
