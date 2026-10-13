import { Module } from '@nestjs/common';
import { PaymentsService } from './application/payments.service';
import { PAYMENT_GATEWAY, PAYMENT_REPOSITORY } from './application/ports/payments.ports';
import { PrismaPaymentRepository } from './infrastructure/prisma-payment.repository';
import { FakePaymentGateway } from './infrastructure/fake.gateway';
import { RazorpayGateway } from './infrastructure/razorpay.gateway';
import { APP_CONFIG, type AppConfig } from '../../common/config/config.module';
import { AdminPaymentsController, PaymentsController } from './interface/payments.controllers';

/** Owns Payment and Refund. Talks to orders only through events (no import of orders). */
@Module({
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [
    PaymentsService,
    RazorpayGateway,
    FakePaymentGateway,
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (config: AppConfig, razorpay: RazorpayGateway, fake: FakePaymentGateway) =>
        config.PAYMENT_PROVIDER === 'fake' ? fake : razorpay,
      inject: [APP_CONFIG, RazorpayGateway, FakePaymentGateway],
    },
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
