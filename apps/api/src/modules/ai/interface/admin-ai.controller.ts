import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { AiStatusDto } from '@abaya/contracts';
import { Roles } from '../../../common/auth/decorators';
import { AiService } from '../application/ai.service';

/** Health of the AI assistant for the admin panel, and queue controls. */
@Controller('admin/ai')
export class AdminAiController {
  constructor(private readonly ai: AiService) {}

  @Roles('CATALOG_MANAGER', 'DESIGNER')
  @Get('status')
  status(): Promise<AiStatusDto> {
    return this.ai.status();
  }

  /** Try failed images again (e.g. after the AI service was fixed). */
  @Roles('CATALOG_MANAGER')
  @Post('retry-failed')
  @HttpCode(200)
  async retryFailed(): Promise<{ queued: number }> {
    return { queued: await this.ai.retryFailed() };
  }

  /** Analyse every image again, e.g. after editing services/ai/vocabulary.json. */
  @Roles('SUPER_ADMIN')
  @Post('reanalyse')
  @HttpCode(200)
  async reanalyse(): Promise<{ queued: number }> {
    return { queued: await this.ai.reanalyseAll() };
  }
}
