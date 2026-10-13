import { Global, Module } from '@nestjs/common';
import { EVENT_PUBLISHER } from './events';
import { NestEventPublisher } from './nest-event-publisher';

@Global()
@Module({
  providers: [{ provide: EVENT_PUBLISHER, useClass: NestEventPublisher }],
  exports: [EVENT_PUBLISHER],
})
export class EventsModule {}
