import { Inject, Injectable } from '@nestjs/common';
import type { RegisterDeviceBody } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { DEVICE_REPOSITORY, type DeviceRepository } from './ports/notify.ports';

/** Push tokens per app install (POST/DELETE /v1/me/devices). */
@Injectable()
export class DevicesService {
  constructor(@Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository) {}

  async register(actor: Actor, input: RegisterDeviceBody): Promise<void> {
    // A token moves to the new user if someone else signs in on the same phone.
    await this.devices.upsert(actor.userId, input);
  }

  unregister(actor: Actor, token: string): Promise<void> {
    return this.devices.remove(actor.userId, token);
  }

  deleteForUser(userId: string): Promise<void> {
    return this.devices.deleteForUser(userId);
  }
}
