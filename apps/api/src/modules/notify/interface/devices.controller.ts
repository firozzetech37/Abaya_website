import { Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { registerDeviceBody, type RegisterDeviceBody } from '@abaya/contracts';
import { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor } from '../../../common/auth/decorators';
import { ZodBody, ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { DevicesService } from '../application/devices.service';

const tokenQuery = z.object({ token: z.string().min(1).max(300) });

/** Expo push tokens for the customer app. */
@Controller('me/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** Called after login and whenever the app starts (keeps lastSeenAt fresh). */
  @Post()
  @HttpCode(204)
  register(@CurrentActor() actor: Actor, @ZodBody(registerDeviceBody) body: RegisterDeviceBody): Promise<void> {
    return this.devices.register(actor, body);
  }

  /** Called on sign-out: DELETE /v1/me/devices?token=ExponentPushToken[...] */
  @Delete()
  @HttpCode(204)
  unregister(@CurrentActor() actor: Actor, @ZodQuery(tokenQuery) query: z.infer<typeof tokenQuery>): Promise<void> {
    return this.devices.unregister(actor, query.token);
  }
}
