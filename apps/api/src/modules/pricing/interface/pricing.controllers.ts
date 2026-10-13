import { TranslateFields } from '../../../common/i18n/translate-fields';
import { Controller, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AdminOptionGroupDto,
  type AdminOptionValueDto,
  type AdminSizeBandDto,
  type FxRatesDto,
  type PriceBreakdown,
  type QuoteBody,
  quoteBody,
  updateOptionValueBody,
  updateSizeBandBody,
  upsertOptionValueBody,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, Public, Roles, StaffOnly } from '../../../common/auth/decorators';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../common/storage/object-storage';
import { ZodBody } from '../../../common/zod/zod-validation.pipe';
import { AdminOptionsService } from '../application/admin-options.service';
import { FxRateService } from '../application/fx-rate.service';
import type { OptionValueRecord } from '../application/ports/option-catalog.repository';
import { PricingService } from '../application/pricing.service';

@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly fx: FxRateService,
  ) {}

  /** Today's INR → AED and INR → SAR rates for the website's display currency (never a charge currency). */
  @Public()
  @Get('rates')
  @Header('Cache-Control', 'public, max-age=3600')
  rates(): Promise<FxRatesDto> {
    return this.fx.rates();
  }

  /** Server-side price for a redesign. Clients show this over their local estimate. */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  // Price lines and chosen options in the page's language (`?lang=ar`).
  @TranslateFields('label', 'groupName', 'valueName')
  @Post('quote')
  @HttpCode(200)
  quote(@ZodBody(quoteBody) body: QuoteBody): Promise<PriceBreakdown> {
    return this.pricing.quote(body);
  }
}

@Controller('admin')
export class AdminOptionsController {
  constructor(
    private readonly options: AdminOptionsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  private toValueDto({ groupId: _g, swatchImagePath, ...v }: OptionValueRecord): AdminOptionValueDto {
    return { ...v, swatchImageUrl: swatchImagePath ? this.storage.publicUrl(swatchImagePath) : null };
  }

  @StaffOnly()
  @Get('options')
  async groups(): Promise<AdminOptionGroupDto[]> {
    const groups = await this.options.listGroupsWithValues();
    return groups.map((g) => ({ ...g, values: g.values.map((v) => this.toValueDto(v)) }));
  }

  @Roles('CATALOG_MANAGER')
  @Post('options/values')
  async createValue(
    @CurrentActor() actor: Actor,
    @ZodBody(upsertOptionValueBody) body: z.infer<typeof upsertOptionValueBody>,
  ): Promise<AdminOptionValueDto> {
    return this.toValueDto(await this.options.createValue(actor, body));
  }

  @Roles('CATALOG_MANAGER')
  @Patch('options/values/:id')
  async updateValue(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateOptionValueBody) body: z.infer<typeof updateOptionValueBody>,
  ): Promise<AdminOptionValueDto> {
    return this.toValueDto(await this.options.updateValue(actor, id, body));
  }

  @StaffOnly()
  @Get('size-bands')
  sizeBands(): Promise<AdminSizeBandDto[]> {
    return this.options.listSizeBands();
  }

  @Roles('CATALOG_MANAGER')
  @Patch('size-bands/:id')
  updateSizeBand(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateSizeBandBody) body: z.infer<typeof updateSizeBandBody>,
  ): Promise<AdminSizeBandDto> {
    return this.options.updateSizeBand(actor, id, body);
  }
}
