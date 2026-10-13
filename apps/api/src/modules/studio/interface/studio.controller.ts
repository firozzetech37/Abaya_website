import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  type AdminDesignDetail,
  designFromImageBody,
  favouriteBody,
  generationBody,
  type GenerationDto,
  type PinPreviewDto,
  type PinterestBoardDto,
  type PinterestPinDto,
  pinUrlBody,
  type ReferenceDto,
  type StudioLimitsDto,
  type StudioSummaryDto,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Roles } from '../../../common/auth/decorators';
import { ZodBody } from '../../../common/zod/zod-validation.pipe';
import { GenerationService } from '../application/generation.service';
import { PinterestService } from '../application/pinterest.service';
import { StudioService } from '../application/studio.service';

/** Designer Studio (docs/apps/studio.md): in-house designers and the catalog manager. */
@Roles('DESIGNER', 'CATALOG_MANAGER')
@Controller('studio')
export class StudioController {
  constructor(
    private readonly studio: StudioService,
    private readonly generations: GenerationService,
    private readonly pinterest: PinterestService,
  ) {}

  @Get('summary')
  summary(@CurrentActor() actor: Actor): Promise<StudioSummaryDto> {
    return this.studio.summary(actor);
  }

  @Get('limits')
  limits(@CurrentActor() actor: Actor): Promise<StudioLimitsDto> {
    return this.generations.limits(actor);
  }

  @Get('generations')
  list(@CurrentActor() actor: Actor): Promise<GenerationDto[]> {
    return this.generations.list(actor);
  }

  @Post('generations')
  create(@CurrentActor() actor: Actor, @ZodBody(generationBody) body: z.infer<typeof generationBody>): Promise<GenerationDto> {
    return this.generations.create(actor, body);
  }

  @Get('generations/:id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<GenerationDto> {
    return this.generations.get(actor, id);
  }

  @Patch('images/:id')
  favourite(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(favouriteBody) body: z.infer<typeof favouriteBody>,
  ): Promise<GenerationDto> {
    return this.generations.favourite(actor, id, body.favourite);
  }

  @Post('images/:id/design')
  designFromImage(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(designFromImageBody) body: z.infer<typeof designFromImageBody>,
  ): Promise<AdminDesignDetail> {
    return this.generations.designFromImage(actor, id, body);
  }

  @Post('pinterest/preview')
  @HttpCode(200)
  preview(@ZodBody(pinUrlBody) body: z.infer<typeof pinUrlBody>): Promise<PinPreviewDto> {
    return this.pinterest.preview(body.url);
  }

  @Post('pinterest/save')
  save(@CurrentActor() actor: Actor, @ZodBody(pinUrlBody) body: z.infer<typeof pinUrlBody>): Promise<ReferenceDto> {
    return this.pinterest.save(actor, body.url, body.note);
  }

  @Get('pinterest/boards')
  boards(): Promise<{ connected: boolean; boards: PinterestBoardDto[] }> {
    return this.pinterest.boards();
  }

  @Get('pinterest/boards/:id/pins')
  boardPins(@Param('id') id: string): Promise<PinterestPinDto[]> {
    return this.pinterest.boardPins(id.slice(0, 40));
  }
}
