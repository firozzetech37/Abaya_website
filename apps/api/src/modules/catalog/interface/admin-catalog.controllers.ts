import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put  } from '@nestjs/common';
import {
  type AdminDesignDetail,
  type AdminDesignListItem,
  type AiInsightsDto,
  applyAiSuggestionBody,
  attachDesignImageBody,
  collectionBody,
  type AdminCollectionDto,
  createDesignBody,
  createReferenceBody,
  designTransitionBody,
  type ListAdminDesignsQuery,
  listAdminDesignsQuery,
  listReferencesQuery,
  type Paginated,
  type ReferenceDto,
  setDesignOptionsBody,
  updateCollectionBody,
  updateDesignBody,
  updateDesignImagesBody,
  updateReferenceBody,
  type AdminAnnouncementDto,
  announcementBody,
  updateAnnouncementBody,
  translateBody,
  type TranslationDto,
} from '@abaya/contracts';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Roles, StaffOnly } from '../../../common/auth/decorators';
import { ZodBody, ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { AnnouncementsService } from '../application/announcements.service';
import { CollectionsService } from '../application/collections.service';
import { DesignsAdminService } from '../application/designs-admin.service';
import { ReferencesService } from '../application/references.service';

@Controller('admin/designs')
export class AdminDesignsController {
  constructor(private readonly designs: DesignsAdminService) {}

  @StaffOnly()
  @Get()
  list(
    @CurrentActor() actor: Actor,
    @ZodQuery(listAdminDesignsQuery) query: ListAdminDesignsQuery,
  ): Promise<Paginated<AdminDesignListItem>> {
    return this.designs.list(actor, query);
  }

  /** Make the clean web-size customer previews again for every live design. */
  @Roles('SUPER_ADMIN')
  @Post('rebuild-previews')
  @HttpCode(200)
  rebuildPreviews(): Promise<{ designs: number; images: number }> {
    return this.designs.rebuildPreviews();
  }

  @StaffOnly()
  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<AdminDesignDetail> {
    return this.designs.get(actor, id);
  }

  @Roles('DESIGNER', 'CATALOG_MANAGER')
  @Post()
  create(
    @CurrentActor() actor: Actor,
    @ZodBody(createDesignBody) body: z.infer<typeof createDesignBody>,
  ): Promise<AdminDesignDetail> {
    return this.designs.create(actor, body);
  }

  @Roles('DESIGNER', 'CATALOG_MANAGER')
  @Patch(':id')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateDesignBody) body: z.infer<typeof updateDesignBody>,
  ): Promise<AdminDesignDetail> {
    return this.designs.update(actor, id, body);
  }

  @Roles('DESIGNER', 'CATALOG_MANAGER')
  @Post(':id/images')
  attachImage(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(attachDesignImageBody) body: z.infer<typeof attachDesignImageBody>,
  ): Promise<AdminDesignDetail> {
    return this.designs.attachImage(actor, id, body);
  }

  @Roles('DESIGNER', 'CATALOG_MANAGER')
  @Patch(':id/images')
  updateImages(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateDesignImagesBody) body: z.infer<typeof updateDesignImagesBody>,
  ): Promise<AdminDesignDetail> {
    return this.designs.updateImages(actor, id, body.images);
  }

  @Roles('DESIGNER', 'CATALOG_MANAGER')
  @Delete(':id/images/:imageId')
  deleteImage(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<AdminDesignDetail> {
    return this.designs.deleteImage(actor, id, imageId);
  }

  @Roles('CATALOG_MANAGER')
  @Put(':id/options')
  setOptions(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(setDesignOptionsBody) body: z.infer<typeof setDesignOptionsBody>,
  ): Promise<AdminDesignDetail> {
    return this.designs.setOptions(
      actor,
      id,
      body.options.map((o) => ({
        optionValueId: o.optionValueId,
        surchargeOverrideInPaise: o.surchargeOverrideInPaise ?? null,
        isDefault: o.isDefault,
      })),
    );
  }

  /** Role and precondition checks per transition live in the Design aggregate. */
  @Roles('DESIGNER', 'CATALOG_MANAGER')
  @Post(':id/transition')
  @HttpCode(200)
  transition(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(designTransitionBody) body: z.infer<typeof designTransitionBody>,
  ): Promise<AdminDesignDetail> {
    return this.designs.transition(actor, id, body.to, body.notes, body.duplicatesChecked, body.originalityConfirmed);
  }

  /** AI assistant: analysis progress, tag/style/alt-text suggestions and look-alike designs. */
  @StaffOnly()
  @Get(':id/ai')
  aiInsights(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<AiInsightsDto> {
    return this.designs.aiInsights(actor, id);
  }

  @Roles('DESIGNER', 'CATALOG_MANAGER')
  @Post(':id/ai/apply')
  @HttpCode(200)
  applyAi(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(applyAiSuggestionBody) body: z.infer<typeof applyAiSuggestionBody>,
  ): Promise<AdminDesignDetail> {
    return this.designs.applyAi(actor, id, body);
  }

  @Roles('DESIGNER', 'CATALOG_MANAGER')
  @Post(':id/ai/dismiss')
  @HttpCode(204)
  dismissAi(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.designs.dismissAi(actor, id);
  }
}

@Controller('admin/collections')
export class AdminCollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @StaffOnly()
  @Get()
  list(): Promise<AdminCollectionDto[]> {
    return this.collections.list();
  }

  @Roles('CATALOG_MANAGER')
  @Post()
  create(@ZodBody(collectionBody) body: z.infer<typeof collectionBody>): Promise<AdminCollectionDto> {
    return this.collections.create(body);
  }

  @Roles('CATALOG_MANAGER')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateCollectionBody) body: z.infer<typeof updateCollectionBody>,
  ): Promise<AdminCollectionDto> {
    return this.collections.update(id, body);
  }
}

@Controller('admin/announcements')
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  // Drafts and scheduled banners included: the catalog managers who run them only.
  @Roles('CATALOG_MANAGER')
  @Get()
  list(): Promise<AdminAnnouncementDto[]> {
    return this.announcements.list();
  }

  @Roles('CATALOG_MANAGER')
  @Post()
  create(@ZodBody(announcementBody) body: z.infer<typeof announcementBody>): Promise<AdminAnnouncementDto> {
    return this.announcements.create(body);
  }

  @Roles('CATALOG_MANAGER')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('translate')
  @HttpCode(200)
  translate(@ZodBody(translateBody) body: z.infer<typeof translateBody>): Promise<TranslationDto> {
    return this.announcements.translate(body.text);
  }

  @Roles('CATALOG_MANAGER')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @ZodBody(updateAnnouncementBody) body: z.infer<typeof updateAnnouncementBody>): Promise<AdminAnnouncementDto> {
    return this.announcements.update(id, body);
  }

  @Roles('CATALOG_MANAGER')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.announcements.delete(id);
  }
}

@Controller('admin/references')
export class AdminReferencesController {
  constructor(private readonly references: ReferencesService) {}

  /** Catalog managers see all; designers see references assigned to them. */
  @Roles('CATALOG_MANAGER', 'DESIGNER')
  @Get()
  list(
    @CurrentActor() actor: Actor,
    @ZodQuery(listReferencesQuery) query: z.infer<typeof listReferencesQuery>,
  ): Promise<Paginated<ReferenceDto>> {
    return this.references.list(actor, query);
  }

  @Roles('CATALOG_MANAGER', 'DESIGNER')
  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<ReferenceDto> {
    return this.references.get(actor, id);
  }

  @Roles('CATALOG_MANAGER')
  @Post()
  create(@ZodBody(createReferenceBody) body: z.infer<typeof createReferenceBody>): Promise<ReferenceDto> {
    return this.references.create(body);
  }

  @Roles('CATALOG_MANAGER', 'DESIGNER')
  @Get(':id/ai')
  aiInsights(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<AiInsightsDto> {
    return this.references.aiInsights(actor, id);
  }

  @Roles('CATALOG_MANAGER')
  @Post(':id/ai/apply')
  @HttpCode(200)
  applyAi(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(applyAiSuggestionBody) body: z.infer<typeof applyAiSuggestionBody>,
  ): Promise<ReferenceDto> {
    return this.references.applyAi(actor, id, body);
  }

  @Roles('CATALOG_MANAGER')
  @Post(':id/ai/dismiss')
  @HttpCode(204)
  dismissAi(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.references.dismissAi(id);
  }

  @Roles('CATALOG_MANAGER')
  @Patch(':id')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateReferenceBody) body: z.infer<typeof updateReferenceBody>,
  ): Promise<ReferenceDto> {
    return this.references.update(actor, id, body);
  }
}
