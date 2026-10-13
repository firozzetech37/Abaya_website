import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  cuttingBody,
  stitchingBody,
  type TailorEarningsDto,
  workshopResumeBody,
  patternBody,
  type PatternStationDto,
  type Role,
  type UploadUrlResponse,
  WORKSHOP_STATIONS,
  workshopAdvanceBody,
  workshopHoldBody,
  type WorkshopItemDetail,
  type WorkshopQueueItem,
  workshopQueueQuery,
  type WorkshopStation,
  type WorkshopStationSummary,
  type WorkshopStepResult,
  workshopUploadBody,
  type WorkshopOverviewDto,
  type WorkshopDoneItemDto,
} from '@abaya/contracts';
import { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Roles } from '../../../common/auth/decorators';
import { ZodValidationPipe, ZodBody, ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { WorkshopOverviewService } from '../application/workshop-overview.service';
import { WorkshopService } from '../application/workshop.service';

/** Everyone who works a station; each call re-checks the station and the item. */
const WORKSHOP_ROLES: Role[] = ['PRODUCTION_MANAGER', 'PATTERN_TECHNICIAN', 'CUTTER', 'MAKER', 'QC', 'FINISHER', 'LOGISTICS'];

const stationParam = new ZodValidationPipe(z.enum(WORKSHOP_STATIONS));

/**
 * The /workshop pages of the admin website (docs/apps/workshop.md). The QC form and
 * shipping reuse POST /v1/admin/order-items/:id/qc and POST /v1/admin/orders/:id/ship.
 */
@Controller('workshop')
@Roles(...WORKSHOP_ROLES)
export class WorkshopController {
  constructor(
    private readonly workshop: WorkshopService,
    private readonly overviewService: WorkshopOverviewService,
  ) {}

  /** Managers: who is working on what, who is idle, and what needs attention. */
  @Roles('PRODUCTION_MANAGER')
  @Get('overview')
  overview(@CurrentActor() actor: Actor): Promise<WorkshopOverviewDto> {
    return this.overviewService.overview(actor);
  }

  @Get('summary')
  summary(@CurrentActor() actor: Actor): Promise<WorkshopStationSummary[]> {
    return this.workshop.summary(actor);
  }

  @Get('stations/:station/items')
  queue(
    @CurrentActor() actor: Actor,
    @Param('station', stationParam) station: WorkshopStation,
    @ZodQuery(workshopQueueQuery) query: z.infer<typeof workshopQueueQuery>,
  ): Promise<WorkshopQueueItem[]> {
    return this.workshop.queue(actor, station, query.view);
  }

  /** The station's finished work (Done tab, last 30 days). */
  @Get('stations/:station/done')
  done(@CurrentActor() actor: Actor, @Param('station', stationParam) station: WorkshopStation): Promise<WorkshopDoneItemDto[]> {
    return this.workshop.done(actor, station);
  }

  @Get('items/:id')
  item(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<WorkshopItemDetail> {
    return this.workshop.item(actor, id);
  }

  @Post('items/:id/claim')
  @HttpCode(200)
  claim(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<WorkshopItemDetail> {
    return this.workshop.claim(actor, id);
  }

  @Post('items/:id/release')
  @HttpCode(200)
  release(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<WorkshopItemDetail> {
    return this.workshop.release(actor, id);
  }

  @Post('items/:id/hold')
  @HttpCode(200)
  hold(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(workshopHoldBody) body: z.infer<typeof workshopHoldBody>,
  ): Promise<WorkshopItemDetail> {
    return this.workshop.hold(actor, id, body.reason, { type: body.problemType, photoPath: body.photoPath });
  }

  @Post('items/:id/resume')
  @HttpCode(200)
  resume(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(workshopResumeBody) body: z.infer<typeof workshopResumeBody>,
  ): Promise<WorkshopItemDetail> {
    return this.workshop.resume(actor, id, body.note, body.to);
  }

  @Post('items/:id/advance')
  @HttpCode(200)
  advance(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(workshopAdvanceBody) body: z.infer<typeof workshopAdvanceBody>,
  ): Promise<WorkshopStepResult> {
    return this.workshop.advance(actor, id, body.to, body.note, body.photoPath);
  }

  /** Pattern station: the pattern to edit, or the confirmed one to work from. */
  @Get('items/:id/pattern')
  pattern(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<PatternStationDto> {
    return this.workshop.pattern(actor, id);
  }

  /** Save the pattern draft (confirmed when the item is sent to cutting). */
  @Roles('PATTERN_TECHNICIAN', 'PRODUCTION_MANAGER')
  @Put('items/:id/pattern')
  savePattern(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(patternBody) body: z.infer<typeof patternBody>,
  ): Promise<PatternStationDto> {
    return this.workshop.savePattern(actor, id, body);
  }

  /** Cutting station: record the cut and send the item to stitching. */
  @Roles('CUTTER', 'PRODUCTION_MANAGER')
  @Post('items/:id/cutting')
  @HttpCode(200)
  cutting(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(cuttingBody) body: z.infer<typeof cuttingBody>,
  ): Promise<WorkshopStepResult> {
    return this.workshop.completeCutting(actor, id, body);
  }

  /** Stitching station: checklist + measurement self-check + photo, then on to QC. */
  @Roles('MAKER', 'PRODUCTION_MANAGER')
  @Post('items/:id/stitching')
  @HttpCode(200)
  stitching(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(stitchingBody) body: z.infer<typeof stitchingBody>,
  ): Promise<WorkshopStepResult> {
    return this.workshop.completeStitching(actor, id, body);
  }

  /** A tailor's payouts: pending, paid this month, paid in total. */
  @Roles('MAKER')
  @Get('earnings')
  earnings(@CurrentActor() actor: Actor): Promise<TailorEarningsDto> {
    return this.workshop.earnings(actor);
  }

  /** Signed URL for one station photo or pattern file (private bucket). */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('uploads')
  upload(@CurrentActor() actor: Actor, @ZodBody(workshopUploadBody) body: z.infer<typeof workshopUploadBody>): Promise<UploadUrlResponse> {
    return this.workshop.createUpload(actor, body);
  }
}
