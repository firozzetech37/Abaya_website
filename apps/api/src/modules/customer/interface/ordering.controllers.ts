import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { type AdminWaitlistDto, type OrderingStatusDto, type OrderingWaitlistDto, paginationQuery } from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Public, Roles } from '../../../common/auth/decorators';
import { ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { OrderingService } from '../application/ordering.service';

/** Public: whether ordering is open (the website shows "Ordering coming soon" when it is not). */
@Controller('ordering')
export class OrderingStatusController {
  constructor(private readonly ordering: OrderingService) {}

  @Public()
  @Get('status')
  status(): OrderingStatusDto {
    return this.ordering.status();
  }
}

/** The signed-in customer: "Notify me when ordering opens". */
@Controller('me/ordering-waitlist')
export class MyWaitlistController {
  constructor(private readonly ordering: OrderingService) {}

  @Get()
  mine(@CurrentActor() actor: Actor): Promise<OrderingWaitlistDto> {
    return this.ordering.mine(actor.userId);
  }

  @Post()
  @HttpCode(200)
  join(@CurrentActor() actor: Actor): Promise<OrderingWaitlistDto> {
    return this.ordering.join(actor.userId);
  }
}

/** Support and catalog managers: who is waiting for ordering to open. */
@Controller('admin/ordering-waitlist')
@Roles('SUPPORT', 'CATALOG_MANAGER')
export class AdminWaitlistController {
  constructor(private readonly ordering: OrderingService) {}

  @Get()
  list(@ZodQuery(paginationQuery) query: z.infer<typeof paginationQuery>): Promise<AdminWaitlistDto> {
    return this.ordering.list(query);
  }
}
