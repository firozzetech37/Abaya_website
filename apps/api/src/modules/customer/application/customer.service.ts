import { Inject, Injectable } from '@nestjs/common';
import type { MeasurementSnapshot } from '../domain/customer.rules';
import { CartService, type QuotedCartItem } from './cart.service';
import { MeasurementsService } from './measurements.service';
import { CUSTOMER_DATA_REPOSITORY, type CustomerDataRepository } from './ports/customer.repositories';

/** Customer module's exported application service (used by orders and privacy). */
@Injectable()
export class CustomerService {
  constructor(
    private readonly measurements: MeasurementsService,
    private readonly cart: CartService,
    @Inject(CUSTOMER_DATA_REPOSITORY) private readonly data: CustomerDataRepository,
  ) {}

  getMeasurementSnapshot(userId: string, profileId: string): Promise<MeasurementSnapshot> {
    return this.measurements.snapshot(userId, profileId);
  }

  quoteCartForCheckout(userId: string): Promise<QuotedCartItem[]> {
    return this.cart.quoteForCheckout(userId);
  }

  removeCartItems(userId: string, itemIds: string[]): Promise<void> {
    return this.cart.removeItems(userId, itemIds);
  }

  /** After payment: empty the bag of everything that was in it at checkout time. */
  clearCartAddedBefore(userId: string, before: Date): Promise<void> {
    return this.cart.removeItemsAddedBefore(userId, before);
  }

  exportForUser(userId: string): Promise<Record<string, unknown>> {
    return this.data.exportForUser(userId);
  }

  deleteForUser(userId: string): Promise<void> {
    return this.data.deleteForUser(userId);
  }
}
