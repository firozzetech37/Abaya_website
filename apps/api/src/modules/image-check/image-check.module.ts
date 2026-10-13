import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { TryOnModule } from '../try-on/try-on.module';
import { WatermarkModule } from '../watermark/watermark.module';
import { ImageCheckService } from './application/image-check.service';
import { ImageCheckController } from './interface/image-check.controller';

/** Admin "Check an image" (docs/apps/admin.md): which design or customer request a picture came from. */
@Module({
  imports: [WatermarkModule, MediaModule, CatalogModule, TryOnModule, IdentityModule],
  controllers: [ImageCheckController],
  providers: [ImageCheckService],
})
export class ImageCheckModule {}
