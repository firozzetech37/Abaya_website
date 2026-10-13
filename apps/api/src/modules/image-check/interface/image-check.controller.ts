import { Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { imageCheckBody, type ImageCheckResultDto } from '@abaya/contracts';
import type { z } from 'zod';
import { Roles } from '../../../common/auth/decorators';
import { ZodBody } from '../../../common/zod/zod-validation.pipe';
import { ImageCheckService } from '../application/image-check.service';

/** Catalog managers and super admins: read our watermark from a picture found elsewhere. */
@Controller('admin/image-checks')
@Roles('CATALOG_MANAGER')
export class ImageCheckController {
  constructor(private readonly checks: ImageCheckService) {}

  /** Reading searches over position and scale, so a check takes a second or two. */
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  check(@ZodBody(imageCheckBody) body: z.infer<typeof imageCheckBody>): Promise<ImageCheckResultDto> {
    return this.checks.check(body.path);
  }
}
