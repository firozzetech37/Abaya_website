import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  addCatalogSetBody,
  type AddCatalogSetResponse,
  type AdminDesignDetail,
  newDesignFromCatalogImageBody,
  catalogJobsQuery,
  type CatalogJobDto,
  type Paginated,
  type CatalogLimitsDto,
  type CatalogModelProfileDto,
  createAiModelBody,
  createCleanupBody,
  createEditBody,
  createMasterBody,
  createOneStepBody,
  createPersonalModelBody,
  createPosesBody,
  createPromptPresetBody,
  createReframeBody,
  describeReferenceBody,
  type DescribeReferenceResponse,
  type CatalogPromptPresetDto,
  reviewCatalogImageBody,
  saveModelProfileBody,
  useCatalogImageBody,
  designEditBody,
  designPhotoshootBody,
  designReframeBody,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Roles } from '../../../common/auth/decorators';
import { ZodBody, ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { CatalogService } from '../application/catalog.service';

/** AI Catalog in the Studio (docs/apps/studio.md): designers and the catalog manager. */
@Roles('DESIGNER', 'CATALOG_MANAGER')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('studio/catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('limits')
  limits(@CurrentActor() actor: Actor): Promise<CatalogLimitsDto> {
    return this.catalog.limits(actor);
  }

  @Get('models')
  models(): Promise<CatalogModelProfileDto[]> {
    return this.catalog.listModels();
  }

  @Post('models/ai')
  createAiModel(
    @CurrentActor() actor: Actor,
    @ZodBody(createAiModelBody) body: z.infer<typeof createAiModelBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.createAiModel(actor, body);
  }

  @Post('models/personal')
  createPersonalModel(
    @CurrentActor() actor: Actor,
    @ZodBody(createPersonalModelBody) body: z.infer<typeof createPersonalModelBody>,
  ): Promise<CatalogModelProfileDto> {
    return this.catalog.createPersonalModel(actor, body);
  }

  @Post('models/from-image')
  saveModel(
    @CurrentActor() actor: Actor,
    @ZodBody(saveModelProfileBody) body: z.infer<typeof saveModelProfileBody>,
  ): Promise<CatalogModelProfileDto> {
    return this.catalog.saveModelFromImage(actor, body.imageId, body.name);
  }

  @Delete('models/:id')
  @HttpCode(204)
  archiveModel(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.catalog.archiveModel(actor, id);
  }

  /** A few words for a reference photo's note (Gemini, free); 20 a minute per person. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('references/describe')
  @HttpCode(200)
  describe(
    @CurrentActor() actor: Actor,
    @ZodBody(describeReferenceBody) body: z.infer<typeof describeReferenceBody>,
  ): Promise<DescribeReferenceResponse> {
    return this.catalog.describeReference(actor, body);
  }

  @Get('presets')
  presets(): Promise<CatalogPromptPresetDto[]> {
    return this.catalog.listPresets();
  }

  @Post('presets')
  createPreset(
    @CurrentActor() actor: Actor,
    @ZodBody(createPromptPresetBody) body: z.infer<typeof createPromptPresetBody>,
  ): Promise<CatalogPromptPresetDto> {
    return this.catalog.createPreset(actor, body);
  }

  @Delete('presets/:id')
  @HttpCode(204)
  archivePreset(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.catalog.archivePreset(actor, id);
  }

  @Get('jobs')
  list(
    @CurrentActor() actor: Actor,
    @ZodQuery(catalogJobsQuery) query: z.infer<typeof catalogJobsQuery>,
  ): Promise<Paginated<CatalogJobDto>> {
    return this.catalog.list(actor, query);
  }

  /** Only jobs still waiting or running (polled while something is being made). */
  @Get('jobs/active')
  active(@CurrentActor() actor: Actor): Promise<CatalogJobDto[]> {
    return this.catalog.listActive(actor);
  }

  @Get('jobs/:id')
  get(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CatalogJobDto> {
    return this.catalog.get(actor, id);
  }

  @Post('masters')
  master(
    @CurrentActor() actor: Actor,
    @ZodBody(createMasterBody) body: z.infer<typeof createMasterBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.createMaster(actor, body);
  }

  /** One step (product-to-model): a new model wearing the abaya in the chosen setting. */
  @Post('masters/one-step')
  oneStep(
    @CurrentActor() actor: Actor,
    @ZodBody(createOneStepBody) body: z.infer<typeof createOneStepBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.createOneStep(actor, body);
  }

  /** From a design's Images tab: the primary photo on a saved model, edited, or reframed; the job remembers the design. */
  @Post('designs/:designId/photoshoot')
  designPhotoshoot(
    @CurrentActor() actor: Actor,
    @Param('designId', ParseUUIDPipe) designId: string,
    @ZodBody(designPhotoshootBody) body: z.infer<typeof designPhotoshootBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.createDesignPhotoshoot(actor, designId, body);
  }

  @Post('designs/:designId/edits')
  designEdit(
    @CurrentActor() actor: Actor,
    @Param('designId', ParseUUIDPipe) designId: string,
    @ZodBody(designEditBody) body: z.infer<typeof designEditBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.createDesignEdit(actor, designId, body);
  }

  @Post('designs/:designId/reframe')
  designReframe(
    @CurrentActor() actor: Actor,
    @Param('designId', ParseUUIDPipe) designId: string,
    @ZodBody(designReframeBody) body: z.infer<typeof designReframeBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.createDesignReframe(actor, designId, body);
  }

  @Post('cleanups')
  cleanup(
    @CurrentActor() actor: Actor,
    @ZodBody(createCleanupBody) body: z.infer<typeof createCleanupBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.createCleanup(actor, body);
  }

  @Patch('images/:id')
  review(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(reviewCatalogImageBody) body: z.infer<typeof reviewCatalogImageBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.review(actor, id, body);
  }

  @Post('images/:id/poses')
  poses(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(createPosesBody) body: z.infer<typeof createPosesBody>,
  ): Promise<CatalogJobDto[]> {
    return this.catalog.createPoses(actor, id, body);
  }

  @Post('images/:id/edits')
  edit(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(createEditBody) body: z.infer<typeof createEditBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.createEdit(actor, id, body);
  }

  @Post('images/:id/reframe')
  reframe(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(createReframeBody) body: z.infer<typeof createReframeBody>,
  ): Promise<CatalogJobDto> {
    return this.catalog.createReframe(actor, id, body);
  }

  @Post('images/:id/retry')
  retry(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CatalogJobDto> {
    return this.catalog.retry(actor, id);
  }

  @Post('images/:id/final')
  final(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CatalogJobDto> {
    return this.catalog.final(actor, id);
  }

  @Post('images/:id/design')
  @HttpCode(200)
  useAsDesignPhoto(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(useCatalogImageBody) body: z.infer<typeof useCatalogImageBody>,
  ): Promise<AdminDesignDetail> {
    return this.catalog.useAsDesignPhoto(actor, id, body.designId, body.primary, body.colourValueId);
  }

  @Post('images/:id/new-design')
  newDesign(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(newDesignFromCatalogImageBody) body: z.infer<typeof newDesignFromCatalogImageBody>,
  ): Promise<AdminDesignDetail> {
    return this.catalog.createDesignFromImage(actor, id, body);
  }

  @Post('designs/:designId/images')
  @HttpCode(200)
  addSet(
    @CurrentActor() actor: Actor,
    @Param('designId', ParseUUIDPipe) designId: string,
    @ZodBody(addCatalogSetBody) body: z.infer<typeof addCatalogSetBody>,
  ): Promise<AddCatalogSetResponse> {
    return this.catalog.addSetToDesign(actor, designId, body);
  }
}
