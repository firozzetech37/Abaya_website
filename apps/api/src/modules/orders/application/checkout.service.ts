import { OrderingService } from '../../customer/application/ordering.service';
import { UploadsService } from '../../media/application/uploads.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CheckoutResponse, PriceBreakdown } from '@abaya/contracts';
import { NotFoundError } from '../../../common/errors/domain-error';
import { CatalogService } from '../../catalog/application/catalog.service';
import { CustomerService } from '../../customer/application/customer.service';
import { IdentityService } from '../../identity/application/identity.service';
import { PaymentsService } from '../../payments/application/payments.service';
import { formatOrderNumber } from '../domain/order.rules';
import { type NewOrderItem, ORDER_REPOSITORY, type OrderRepository } from './ports/orders.ports';

export type CheckoutResult = CheckoutResponse;

/** Per-abaya breakdown: the cart line's price for quantity 1. */
const singleUnit = (b: PriceBreakdown): PriceBreakdown => ({ ...b, quantity: 1, totalInPaise: b.unitPriceInPaise });

/**
 * POST /v1/checkout: re-quote every bag item on the server, snapshot design,
 * options, measurements and address, create the order and the Razorpay order.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly customer: CustomerService,
    private readonly catalog: CatalogService,
    private readonly identity: IdentityService,
    private readonly payments: PaymentsService,
    private readonly uploads: UploadsService,
    private readonly ordering: OrderingService,
  ) {}

  async checkout(userId: string, input: { addressId: string; customerNote?: string }): Promise<CheckoutResult> {
    this.ordering.assertOpen(); // "Ordering coming soon"
    const shippingAddress = await this.identity.getAddressSnapshot(userId, input.addressId);
    const quoted = await this.customer.quoteCartForCheckout(userId); // throws if anything is not orderable

    const items: NewOrderItem[] = [];
    for (const { item, quote } of quoted) {
      const design = await this.catalog.snapshot(item.designId);
      if (!design || !quote) throw new NotFoundError('Design');
      const measurements = item.measurementProfileId
        ? await this.customer.getMeasurementSnapshot(userId, item.measurementProfileId)
        : null;
      // Her AI preview for the workshop: the order keeps its own copy (the bag's goes with the bag).
      const aiPreviewPath = item.aiPreviewPath ? await this.uploads.copyPrivate(item.aiPreviewPath, 'ORDER_AI_PREVIEW').catch(() => null) : null;
      // One OrderItem per abaya: each is cut, stitched and checked on its own.
      for (let n = 0; n < item.quantity; n += 1) {
        items.push({
          designId: design.id,
          designSnapshot: design,
          optionsSnapshot: quote.selectedOptions,
          sizeBandCode: quote.sizeBand.code,
          measurementsSnapshot: measurements as Record<string, number | string | null> | null,
          priceBreakdown: singleUnit(quote.breakdown),
          unitPriceInPaise: quote.breakdown.unitPriceInPaise,
          aiPreviewPath,
          aiPreviewInspiration: aiPreviewPath ? item.aiPreviewInspiration : false,
        });
      }
    }

    const subtotal = items.reduce((sum, i) => sum + i.unitPriceInPaise, 0);
    const sequence = await this.orders.nextOrderSequence();
    const order = await this.orders.createPending({
      orderNumber: formatOrderNumber(new Date().getUTCFullYear(), sequence),
      userId,
      subtotalInPaise: subtotal,
      totalInPaise: subtotal, // free shipping, no discounts in Phase 1; prices are GST-inclusive
      shippingAddress,
      customerNote: input.customerNote,
      items,
    });

    try {
      const payment = await this.payments.createForOrder(order);
      return { orderId: order.id, orderNumber: order.orderNumber, totalInPaise: order.totalInPaise, ...payment };
    } catch (e) {
      // The payment never started, so this order can never be paid.
      await this.orders.setStatus(order.id, ['PENDING_PAYMENT'], 'CANCELLED', {
        actorUserId: null,
        action: 'order.cancelled',
        entityType: 'Order',
        entityId: order.id,
        after: { status: 'CANCELLED', reason: 'payment could not be started' },
      });
      this.logger.warn({ orderId: order.id }, 'Checkout failed to create a payment');
      throw e;
    }
  }
}
