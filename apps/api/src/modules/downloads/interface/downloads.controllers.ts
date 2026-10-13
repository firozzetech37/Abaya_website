import { Controller, Get, HttpCode, Injectable, Param, ParseIntPipe, ParseUUIDPipe, Post } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Throttle } from '@nestjs/throttler';
import {
  type AdminDownloadDto,
  adminDownloadsQuery,
  type AdminDownloadsSummaryDto,
  createDownloadBody,
  type CreateDownloadResponse,
  type DownloadDto,
  type DownloadLinkDto,
  type Paginated,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Roles } from '../../../common/auth/decorators';
import { EVENTS, type PaymentCapturedEvent } from '../../../common/events/events';
import { ZodBody, ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { DownloadsService } from '../application/downloads.service';

/** The signed-in customer's HD design downloads. */
@Controller('me/downloads')
export class MyDownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @Get()
  list(@CurrentActor() actor: Actor): Promise<DownloadDto[]> {
    return this.downloads.listMine(actor);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  create(@CurrentActor() actor: Actor, @ZodBody(createDownloadBody) body: z.infer<typeof createDownloadBody>): Promise<CreateDownloadResponse> {
    return this.downloads.create(actor, body.designId);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<DownloadDto> {
    return this.downloads.get(actor, id);
  }

  /** Development only (test payments): pay without Razorpay. */
  @Post(':id/simulate-payment')
  @HttpCode(200)
  simulate(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<DownloadDto> {
    return this.downloads.simulatePayment(actor, id);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post(':id/files/:index')
  @HttpCode(200)
  link(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
  ): Promise<DownloadLinkDto> {
    return this.downloads.link(actor, id, index);
  }
}

@Roles('CATALOG_MANAGER', 'SUPPORT')
@Controller('admin/downloads')
export class AdminDownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @Get()
  list(@ZodQuery(adminDownloadsQuery) query: z.infer<typeof adminDownloadsQuery>): Promise<Paginated<AdminDownloadDto>> {
    return this.downloads.listAdmin(query);
  }

  @Get('summary')
  summary(): Promise<AdminDownloadsSummaryDto> {
    return this.downloads.summary();
  }
}

/** Payment captured for a download → mark it paid. Errors propagate so Razorpay retries. */
@Injectable()
export class DownloadsListeners {
  constructor(private readonly downloads: DownloadsService) {}

  @OnEvent(EVENTS.PaymentCaptured, { promisify: true, suppressErrors: false })
  onPaymentCaptured(event: PaymentCapturedEvent): Promise<void> {
    return this.downloads.handlePaymentCaptured(event);
  }
}
