import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AdminCustomerPreviewDto,
  checkTryOnPhotoBody,
  adminCustomerPreviewsQuery,
  type AdminCustomerPreviewSummaryDto,
  createCustomerPreviewBody,
  createTryOnBody,
  type CustomerAiLimitsDto,
  type CustomerPreviewDto,
  hideCustomerPreviewBody,
  type MyAiPicturesDto,
  type Paginated,
  recentAiPicturesQuery,
  type RecentAiPicturesDto,
  type TryOnPhotoCheckDto,
  tryOnUploadBody,
  type UploadUrlResponse,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Roles } from '../../../common/auth/decorators';
import { TranslateFields } from '../../../common/i18n/translate-fields';
import { ZodBody, ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { TryOnService } from '../application/try-on.service';

/** The signed-in customer's AI preview and try-on on a design page. */
@Controller('me/try-on')
export class MyTryOnController {
  constructor(private readonly tryOn: TryOnService) {}

  @Get('limits')
  limits(@CurrentActor() actor: Actor): Promise<CustomerAiLimitsDto> {
    return this.tryOn.limits(actor);
  }

  // Daily limits do the real work; this only stops scripts hammering the endpoint.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('previews')
  preview(
    @CurrentActor() actor: Actor,
    @ZodBody(createCustomerPreviewBody) body: z.infer<typeof createCustomerPreviewBody>,
  ): Promise<CustomerPreviewDto> {
    return this.tryOn.createPreview(actor, body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('uploads')
  upload(@CurrentActor() actor: Actor, @ZodBody(tryOnUploadBody) body: z.infer<typeof tryOnUploadBody>): Promise<UploadUrlResponse> {
    return this.tryOn.uploadUrl(actor, body.contentType);
  }

  /** Her photo, checked the moment she picks it: standing, whole body, facing the camera. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('photo-check')
  @HttpCode(200)
  photoCheck(@ZodBody(checkTryOnPhotoBody) body: z.infer<typeof checkTryOnPhotoBody>): Promise<TryOnPhotoCheckDto> {
    return this.tryOn.checkPhoto(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('try-ons')
  tryOnCreate(@CurrentActor() actor: Actor, @ZodBody(createTryOnBody) body: z.infer<typeof createTryOnBody>): Promise<CustomerPreviewDto> {
    return this.tryOn.createTryOn(actor, body);
  }

  /** "My AI pictures" on her profile: every picture she can still see, from every abaya (declared before ':id'). */
  @Get('mine')
  @TranslateFields('name')
  mine(@CurrentActor() actor: Actor): Promise<MyAiPicturesDto> {
    return this.tryOn.mine(actor);
  }

  /** Her recent previews and try-ons of one design (declared before ':id'). */
  @Get('recent')
  recent(@CurrentActor() actor: Actor, @ZodQuery(recentAiPicturesQuery) query: z.infer<typeof recentAiPicturesQuery>): Promise<RecentAiPicturesDto> {
    return this.tryOn.recent(actor, query.designId);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<CustomerPreviewDto> {
    return this.tryOn.get(actor, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tryOn.remove(actor, id);
  }
}

/** Catalog manager: website previews made today, credits, and hiding a bad preview. Never try-ons. */
@Controller('admin/customer-previews')
@Roles('CATALOG_MANAGER')
export class AdminCustomerPreviewsController {
  constructor(private readonly tryOn: TryOnService) {}

  @Get()
  list(@ZodQuery(adminCustomerPreviewsQuery) query: z.infer<typeof adminCustomerPreviewsQuery>): Promise<Paginated<AdminCustomerPreviewDto>> {
    return this.tryOn.listPreviews(query);
  }

  @Get('summary')
  summary(): Promise<AdminCustomerPreviewSummaryDto> {
    return this.tryOn.summary();
  }

  @Patch(':id')
  @HttpCode(204)
  hide(
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(hideCustomerPreviewBody) body: z.infer<typeof hideCustomerPreviewBody>,
  ): Promise<void> {
    return this.tryOn.setHidden(id, body.hidden);
  }
}
