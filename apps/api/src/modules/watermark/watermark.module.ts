import { Module } from '@nestjs/common';
import { IMAGE_RASTER, WatermarkService } from './application/watermark.service';
import { SharpImageRaster } from './infrastructure/sharp-image-raster';

/**
 * Invisible watermark on customer-facing pictures (docs/apps/web.md "Image protection").
 * Imports nothing: the media and try-on modules call it to mark, the image-check module to read.
 */
@Module({
  providers: [WatermarkService, { provide: IMAGE_RASTER, useClass: SharpImageRaster }],
  exports: [WatermarkService],
})
export class WatermarkModule {}
