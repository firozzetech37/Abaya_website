import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  type AddressBody,
  addressBody,
  type AddressDto,
  type MeResponse,
  type RecordConsentsBody,
  recordConsentsBody,
  updateProfileBody,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor } from '../../../common/auth/decorators';
import { ZodBody } from '../../../common/zod/zod-validation.pipe';
import { AddressesService } from '../application/addresses.service';
import { IdentityService } from '../application/identity.service';

/** Customer's own profile, consents and addresses. Any logged-in user. */
@Controller('me')
export class MeController {
  constructor(
    private readonly identity: IdentityService,
    private readonly addresses: AddressesService,
  ) {}

  @Get()
  me(@CurrentActor() actor: Actor): Promise<MeResponse> {
    return this.identity.me(actor.userId);
  }

  @Patch()
  update(
    @CurrentActor() actor: Actor,
    @ZodBody(updateProfileBody) body: z.infer<typeof updateProfileBody>,
  ): Promise<MeResponse> {
    return this.identity.updateProfile(actor.userId, body);
  }

  @Post('consents')
  @HttpCode(200)
  consents(
    @CurrentActor() actor: Actor,
    @ZodBody(recordConsentsBody) body: RecordConsentsBody,
  ): Promise<MeResponse> {
    return this.identity.recordConsents(actor.userId, body, actor.ip);
  }

  @Get('addresses')
  listAddresses(@CurrentActor() actor: Actor): Promise<AddressDto[]> {
    return this.addresses.list(actor.userId);
  }

  @Post('addresses')
  createAddress(
    @CurrentActor() actor: Actor,
    @ZodBody(addressBody) body: AddressBody,
  ): Promise<AddressDto> {
    return this.addresses.create(actor.userId, body);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(addressBody.partial()) body: Partial<AddressBody>,
  ): Promise<AddressDto> {
    return this.addresses.update(actor.userId, id, body);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  deleteAddress(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.addresses.delete(actor.userId, id);
  }
}
