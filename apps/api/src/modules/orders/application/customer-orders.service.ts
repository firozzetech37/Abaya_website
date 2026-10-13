import { Inject, Injectable } from '@nestjs/common';
import type { OrderDetailDto, OrderSummaryDto, Paginated } from '@abaya/contracts';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import { PaymentsService } from '../../payments/application/payments.service';
import { toDetailDto, toSummaryDto } from './order-views';
import { ORDER_MEDIA, ORDER_REPOSITORY, type OrderMedia, type OrderRepository } from './ports/orders.ports';

/** A customer's own orders. Other people's orders are reported as not found. */
@Injectable()
export class CustomerOrdersService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_MEDIA) private readonly media: OrderMedia,
    private readonly payments: PaymentsService,
  ) {}

  async list(userId: string, cursor: string | undefined, limit: number): Promise<Paginated<OrderSummaryDto>> {
    const page = await this.orders.listForUser(userId, cursor, limit);
    return { items: page.items.map((o) => toSummaryDto(o, this.media)), nextCursor: page.nextCursor };
  }

  /** Development test mode: pay one's own pending order without Razorpay. */
  async simulatePayment(userId: string, orderNumber: string): Promise<OrderDetailDto> {
    const order = await this.orders.findByNumber(orderNumber);
    if (!order || order.userId !== userId) throw new NotFoundError('Order');
    if (order.status !== 'PENDING_PAYMENT') throw new BusinessRuleError('ALREADY_PAID', 'This order is not waiting for payment.');
    await this.payments.simulateCapture(order.id);
    return this.get(userId, orderNumber);
  }

  async get(userId: string, orderNumber: string): Promise<OrderDetailDto> {
    const order = await this.orders.findByNumber(orderNumber);
    if (!order || order.userId !== userId) throw new NotFoundError('Order');
    return toDetailDto(order, this.media);
  }
}
