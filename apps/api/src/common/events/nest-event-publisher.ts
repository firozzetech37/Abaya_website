import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EventMap, EventPublisher } from './events';

@Injectable()
export class NestEventPublisher implements EventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  /** Awaits every listener, so a failing listener surfaces instead of vanishing. */
  async publish<K extends keyof EventMap>(name: K, payload: EventMap[K]): Promise<void> {
    await this.emitter.emitAsync(name, payload);
  }
}
