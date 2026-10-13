import { Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { deleteAccountBody } from '@abaya/contracts';
import type { z } from 'zod';
import type { AuthenticatedUser } from '../../../common/auth/auth.types';
import { CurrentUser } from '../../../common/auth/decorators';
import { ZodBody } from '../../../common/zod/zod-validation.pipe';
import { PrivacyService } from '../application/privacy.service';

@Controller('me')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Everything we hold about the user, as JSON. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('data-export')
  @HttpCode(200)
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.privacy.export(user.id);
  }

  /** Body must be `{ "confirm": "DELETE" }` so it cannot happen by accident. */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Delete()
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(deleteAccountBody) _body: z.infer<typeof deleteAccountBody>,
  ): Promise<void> {
    await this.privacy.deleteAccount({ userId: user.id, roles: user.roles, authUserId: user.authUserId });
  }
}
