import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { DesignsAdminService } from '../application/designs-admin.service';

/**
 * At start-up, remake any customer web preview made by older code (e.g. the old watermarked
 * ones) without anyone pressing "Rebuild website images". Runs in the background, once per photo.
 */
@Injectable()
export class PreviewRefreshOnStart implements OnApplicationBootstrap {
  private readonly logger = new Logger(PreviewRefreshOnStart.name);

  constructor(
    private readonly designs: DesignsAdminService,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'PREVIEW_REFRESH_ON_START'>,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.PREVIEW_REFRESH_ON_START) return;
    void this.designs
      .refreshStalePreviews()
      .then((n) => n && this.logger.log(`Remade ${n} website image(s) made by older code`))
      .catch((e: unknown) => this.logger.warn({ err: e instanceof Error ? e.message : e }, 'Could not refresh website images'));
  }
}
