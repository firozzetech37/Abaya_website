import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CustomerModule } from '../customer/customer.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { PaymentsModule } from '../payments/payments.module';
import { CheckoutExpiryService } from './application/checkout-expiry.service';
import { CheckoutService } from './application/checkout.service';
import { CustomerOrdersService } from './application/customer-orders.service';
import { OrdersService } from './application/orders.service';
import { ORDER_MEDIA, ORDER_REPOSITORY } from './application/ports/orders.ports';
import { PrismaOrderRepository } from './infrastructure/prisma-order.repository';
import { StorageOrderMedia } from './infrastructure/storage-order-media';
import { OrdersController } from './interface/orders.controllers';
import { OrdersListeners } from './interface/orders.listeners';

@Module({
  imports: [IdentityModule, CatalogModule, CustomerModule, PaymentsModule, MediaModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    CheckoutService,
    CheckoutExpiryService,
    CustomerOrdersService,
    OrdersListeners,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: ORDER_MEDIA, useClass: StorageOrderMedia },
  ],
  exports: [OrdersService, ORDER_MEDIA, CheckoutExpiryService],
})
export class OrdersModule {}
