import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, type TailorAddedEvent } from '../../../common/events/events';
import { MakersService } from '../application/makers.service';

/** Staff & roles adds tailors; their tailor record lives here. Errors fail the invite. */
@Injectable()
export class ProductionListeners {
  constructor(private readonly makers: MakersService) {}

  @OnEvent(EVENTS.TailorAdded, { promisify: true, suppressErrors: false })
  async onTailorAdded(e: TailorAddedEvent): Promise<void> {
    await this.makers.ensureTailor(e);
  }
}
