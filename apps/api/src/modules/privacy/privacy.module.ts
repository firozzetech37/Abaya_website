import { Module } from '@nestjs/common';
import { CustomerModule } from '../customer/customer.module';
import { IdentityModule } from '../identity/identity.module';
import { NotifyModule } from '../notify/notify.module';
import { OrdersModule } from '../orders/orders.module';
import { TryOnModule } from '../try-on/try-on.module';
import { PrivacyService } from './application/privacy.service';
import { PrivacyController } from './interface/privacy.controller';

@Module({
  imports: [IdentityModule, CustomerModule, OrdersModule, NotifyModule, TryOnModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
