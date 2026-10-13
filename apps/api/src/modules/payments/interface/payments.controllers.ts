import { Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, type RawBodyRequest, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type PaymentDto, refundBody, verifyPaymentBody } from '@abaya/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Public, Roles } from '../../../common/auth/decorators';
import { ZodBody } from '../../../common/zod/zod-validation.pipe';
import { PaymentsService } from '../application/payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Public: 'razorpay' (real) or 'test' (development PAYMENT_PROVIDER=fake). */
  @Public()
  @Get('config')
  config() {
    return this.payments.config();
  }

  /** Called by web/mobile after Razorpay Checkout succeeds. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('verify')
  @HttpCode(200)
  verify(@ZodBody(verifyPaymentBody) body: z.infer<typeof verifyPaymentBody>) {
    return this.payments.verifyClientPayment(body);
  }

  /** Razorpay → us. No login; the HMAC signature over the raw body is the authentication. */
  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature?: string) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}

@Controller('admin/orders/:orderId')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Roles('SUPER_ADMIN', 'CATALOG_MANAGER', 'PRODUCTION_MANAGER', 'QC', 'SUPPORT')
  @Get('payments')
  list(@Param('orderId', ParseUUIDPipe) orderId: string): Promise<PaymentDto[]> {
    return this.payments.listForOrder(orderId);
  }

  /** SUPPORT up to ₹5,000 per refund; SUPER_ADMIN any amount (checked in the domain). */
  @Roles('SUPPORT', 'SUPER_ADMIN')
  @Post('refunds')
  refund(
    @CurrentActor() actor: Actor,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @ZodBody(refundBody) body: z.infer<typeof refundBody>,
  ): Promise<PaymentDto> {
    return this.payments.refund(actor, orderId, body.amountInPaise, body.reason);
  }
}
