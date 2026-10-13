import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EVENTS,
  type PaymentCapturedEvent,
  type RefundProcessedEvent,
} from '../../../common/events/events';
import { OrdersService } from '../application/orders.service';

/** Reacts to payments' events. Errors propagate so the webhook fails and Razorpay retries. */
@Injectable()
export class OrdersListeners {
  constructor(private readonly orders: OrdersService) {}

  @OnEvent(EVENTS.PaymentCaptured, { promisify: true, suppressErrors: false })
  onPaymentCaptured(event: PaymentCapturedEvent): Promise<void> {
    return this.orders.handlePaymentCaptured(event);
  }

  @OnEvent(EVENTS.RefundProcessed, { promisify: true, suppressErrors: false })
  onRefundProcessed(event: RefundProcessedEvent): Promise<void> {
    return this.orders.handleRefundProcessed(event);
  }
}
