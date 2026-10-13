import { MediaModule } from '../media/media.module';
import { TryOnModule } from '../try-on/try-on.module';
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingOptionsModule } from '../pricing/pricing-options.module';
import { PricingModule } from '../pricing/pricing.module';
import { CartService } from './application/cart.service';
import { CustomerService } from './application/customer.service';
import { MeasurementsService } from './application/measurements.service';
import {
  CART_REPOSITORY,
  CUSTOMER_DATA_REPOSITORY,
  MEASUREMENT_REPOSITORY,
  WISHLIST_REPOSITORY,
} from './application/ports/customer.repositories';
import { WishlistService } from './application/wishlist.service';
import {
  PrismaCartRepository,
  PrismaCustomerDataRepository,
  PrismaMeasurementRepository,
  PrismaWishlistRepository,
} from './infrastructure/prisma-customer.repositories';
import { CartController, MeasurementsController, WishlistController } from './interface/customer.controllers';
import { AdminWaitlistController, MyWaitlistController, OrderingStatusController } from './interface/ordering.controllers';
import { OrderingService, WAITLIST_REPOSITORY } from './application/ordering.service';
import { PrismaWaitlistRepository } from './infrastructure/prisma-waitlist.repository';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [CatalogModule, PricingModule, PricingOptionsModule, TryOnModule, MediaModule, IdentityModule],
  controllers: [MeasurementsController, WishlistController, CartController, OrderingStatusController, MyWaitlistController, AdminWaitlistController],
  providers: [
    MeasurementsService,
    WishlistService,
    CartService,
    CustomerService,
    OrderingService,
    { provide: WAITLIST_REPOSITORY, useClass: PrismaWaitlistRepository },
    { provide: MEASUREMENT_REPOSITORY, useClass: PrismaMeasurementRepository },
    { provide: CART_REPOSITORY, useClass: PrismaCartRepository },
    { provide: WISHLIST_REPOSITORY, useClass: PrismaWishlistRepository },
    { provide: CUSTOMER_DATA_REPOSITORY, useClass: PrismaCustomerDataRepository },
  ],
  exports: [CustomerService, OrderingService],
})
export class CustomerModule {}
