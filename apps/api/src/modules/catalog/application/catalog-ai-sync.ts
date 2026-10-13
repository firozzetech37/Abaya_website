import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AiService } from '../../ai/application/ai.service';
import { DesignsAdminService } from './designs-admin.service';
import { ReferencesService } from './references.service';

/**
 * On startup, make sure every design image and reference is known to the AI assistant:
 * images uploaded before Step 15 (or while the AI was off) get queued once, and rows for
 * deleted images are dropped. Cheap: already-known images are skipped.
 */
@Injectable()
export class CatalogAiSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogAiSync.name);

  constructor(
    private readonly ai: AiService,
    private readonly designs: DesignsAdminService,
    private readonly references: ReferencesService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.ai.enabled) return;
    // Do not delay startup; failures only mean some images are analysed later.
    void this.sync().catch((e: unknown) => this.logger.warn({ err: e }, 'AI sync failed'));
  }

  async sync(): Promise<{ added: number; removed: number }> {
    const [images, refs] = await Promise.all([this.designs.listImagesForAi(), this.references.listImagesForAi()]);
    const a = await this.ai.sync('DESIGN_IMAGE', images);
    const b = await this.ai.sync('REFERENCE', refs);
    const total = { added: a.added + b.added, removed: a.removed + b.removed };
    if (total.added + total.removed > 0) this.logger.log(`AI assistant: queued ${total.added} image(s), removed ${total.removed}`);
    return total;
  }
}
