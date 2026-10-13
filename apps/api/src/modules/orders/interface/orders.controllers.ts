import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  checkoutBody,
  type OrderDetailDto,
  type OrderSummaryDto,
  type Paginated,
  paginationQuery,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor } from '../../../common/auth/decorators';
import { ZodBody, ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { type CheckoutResult, CheckoutService } from '../application/checkout.service';
import { CustomerOrdersService } from '../application/customer-orders.service';

@Controller()
export class OrdersController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly orders: CustomerOrdersService,
  ) {}

  /** Prices are recalculated here; anything a client sends about price is ignored. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('checkout')
  checkout(
    @CurrentActor() actor: Actor,
    @ZodBody(checkoutBody) body: z.infer<typeof checkoutBody>,
  ): Promise<CheckoutResult> {
    return this.checkoutService.checkout(actor.userId, body);
  }

  @Get('orders')
  list(
    @CurrentActor() actor: Actor,
    @ZodQuery(paginationQuery) query: z.infer<typeof paginationQuery>,
  ): Promise<Paginated<OrderSummaryDto>> {
    return this.orders.list(actor.userId, query.cursor, query.limit);
  }

  /** PAYMENT_PROVIDER=fake only (404 otherwise): pay this pending order without Razorpay. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders/:orderNumber/simulate-payment')
  @HttpCode(200)
  simulatePayment(@CurrentActor() actor: Actor, @Param('orderNumber') orderNumber: string): Promise<OrderDetailDto> {
    return this.orders.simulatePayment(actor.userId, orderNumber);
  }

  @Get('orders/:orderNumber')
  get(@CurrentActor() actor: Actor, @Param('orderNumber') orderNumber: string): Promise<OrderDetailDto> {
    return this.orders.get(actor.userId, orderNumber);
  }
}
