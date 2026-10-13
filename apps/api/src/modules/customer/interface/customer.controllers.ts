import { TranslateFields } from '../../../common/i18n/translate-fields';
import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  addCartItemBody,
  type CartDto,
  type MeasurementBody,
  measurementBody,
  type MeasurementProfileDto,
  type QuoteBody,
  updateCartItemBody,
  type WishlistItemDto,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor } from '../../../common/auth/decorators';
import { ZodBody } from '../../../common/zod/zod-validation.pipe';
import { CartService } from '../application/cart.service';
import { MeasurementsService } from '../application/measurements.service';
import { WishlistService } from '../application/wishlist.service';

@Controller('me/measurements')
export class MeasurementsController {
  constructor(private readonly measurements: MeasurementsService) {}

  @Get()
  list(@CurrentActor() actor: Actor): Promise<MeasurementProfileDto[]> {
    return this.measurements.list(actor.userId);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<MeasurementProfileDto> {
    return this.measurements.get(actor.userId, id);
  }

  @Post()
  create(@CurrentActor() actor: Actor, @ZodBody(measurementBody) body: MeasurementBody): Promise<MeasurementProfileDto> {
    return this.measurements.create(actor.userId, body);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(measurementBody.partial()) body: Partial<MeasurementBody>,
  ): Promise<MeasurementProfileDto> {
    return this.measurements.update(actor.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.measurements.delete(actor.userId, id);
  }
}

@Controller('me/wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @TranslateFields('name')
  @Get()
  list(@CurrentActor() actor: Actor): Promise<WishlistItemDto[]> {
    return this.wishlist.list(actor.userId);
  }

  /** Idempotent: saving the same design twice keeps one entry. */
  @Post(':designId')
  add(@CurrentActor() actor: Actor, @Param('designId', ParseUUIDPipe) designId: string): Promise<WishlistItemDto[]> {
    return this.wishlist.add(actor.userId, designId);
  }

  @Delete(':designId')
  @HttpCode(204)
  remove(@CurrentActor() actor: Actor, @Param('designId', ParseUUIDPipe) designId: string): Promise<void> {
    return this.wishlist.remove(actor.userId, designId);
  }
}

@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentActor() actor: Actor): Promise<CartDto> {
    return this.cart.get(actor.userId);
  }

  @Post('items')
  add(@CurrentActor() actor: Actor, @ZodBody(addCartItemBody) body: QuoteBody): Promise<CartDto> {
    return this.cart.addItem(actor.userId, body);
  }

  @Patch('items/:id')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateCartItemBody) body: z.infer<typeof updateCartItemBody>,
  ): Promise<CartDto> {
    return this.cart.updateQuantity(actor.userId, id, body.quantity);
  }

  @Delete('items/:id')
  remove(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<CartDto> {
    return this.cart.removeItem(actor.userId, id);
  }
}
