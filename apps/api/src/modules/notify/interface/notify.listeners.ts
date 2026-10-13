import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EVENTS,
  type OrderPaidEvent,
  type OrderStageChangedEvent,
  type RefundProcessedEvent,
} from '../../../common/events/events';
import { NotifyService } from '../application/notify.service';

/** Notifications never block the action that caused them (errors are logged, not thrown). */
@Injectable()
export class NotifyListeners {
  constructor(private readonly notify: NotifyService) {}

  @OnEvent(EVENTS.OrderPaid, { promisify: true })
  onOrderPaid(e: OrderPaidEvent) {
    return this.notify.orderPaid(e);
  }

  @OnEvent(EVENTS.OrderStageChanged, { promisify: true })
  onStageChanged(e: OrderStageChangedEvent) {
    return this.notify.stageChanged(e);
  }

  @OnEvent(EVENTS.RefundProcessed, { promisify: true })
  onRefund(e: RefundProcessedEvent) {
    return this.notify.refundProcessed(e);
  }
}
