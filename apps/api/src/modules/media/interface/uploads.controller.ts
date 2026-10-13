import { Controller, Post } from '@nestjs/common';
import { createUploadUrlBody, type UploadUrlResponse } from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, StaffOnly } from '../../../common/auth/decorators';
import { ZodBody } from '../../../common/zod/zod-validation.pipe';
import { UploadsService } from '../application/uploads.service';

@Controller('admin/uploads')
@StaffOnly()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Returns a signed URL; the client PUTs the file there, then sends `storagePath` back. */
  @Post()
  create(
    @CurrentActor() actor: Actor,
    @ZodBody(createUploadUrlBody) body: z.infer<typeof createUploadUrlBody>,
  ): Promise<UploadUrlResponse> {
    return this.uploads.createUploadUrl(actor, body);
  }
}
