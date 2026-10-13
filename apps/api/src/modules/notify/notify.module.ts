import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductionModule } from '../production/production.module';
import { DevicesService } from './application/devices.service';
import { NotificationDispatcher } from './application/notification-dispatcher.service';
import { NotifyService } from './application/notify.service';
import {
  DEVICE_REPOSITORY,
  EMAIL_CHANNEL,
  NOTIFICATION_OUTBOX,
  PUSH_CHANNEL,
  WHATSAPP_CHANNEL,
} from './application/ports/notify.ports';
import { ExpoPushChannel, ResendEmailChannel, WhatsAppChannel } from './infrastructure/channels';
import { PrismaDeviceRepository, PrismaNotificationOutbox } from './infrastructure/prisma-notify.repositories';
import { DevicesController } from './interface/devices.controller';
import { NotifyListeners } from './interface/notify.listeners';

/** Email (Resend), WhatsApp (Interakt/Gupshup) and Expo push through a Postgres outbox. */
@Module({
  imports: [IdentityModule, OrdersModule, ProductionModule],
  controllers: [DevicesController],
  providers: [
    NotifyService,
    NotificationDispatcher,
    DevicesService,
    NotifyListeners,
    { provide: NOTIFICATION_OUTBOX, useClass: PrismaNotificationOutbox },
    { provide: DEVICE_REPOSITORY, useClass: PrismaDeviceRepository },
    { provide: EMAIL_CHANNEL, useClass: ResendEmailChannel },
    { provide: WHATSAPP_CHANNEL, useClass: WhatsAppChannel },
    { provide: PUSH_CHANNEL, useClass: ExpoPushChannel },
  ],
  exports: [NotifyService, DevicesService],
})
export class NotifyModule {}
