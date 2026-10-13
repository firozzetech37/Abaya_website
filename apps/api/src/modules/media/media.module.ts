import { Module } from '@nestjs/common';
import { IMAGE_CLEANER } from './application/image-cleaner';
import { SharpImageCleaner } from './infrastructure/sharp-image-cleaner';
import { PRIVATE_FILE_STORE, UPLOAD_URL_SIGNER, UploadsService } from './application/uploads.service';
import { StorageUploadSigner } from './infrastructure/storage-upload-signer';
import { UploadsController } from './interface/uploads.controller';
import { WatermarkModule } from '../watermark/watermark.module';

@Module({
  imports: [WatermarkModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    StorageUploadSigner,
    { provide: UPLOAD_URL_SIGNER, useExisting: StorageUploadSigner },
    { provide: PRIVATE_FILE_STORE, useExisting: StorageUploadSigner },
    { provide: IMAGE_CLEANER, useClass: SharpImageCleaner },
  ],
  exports: [UploadsService],
})
export class MediaModule {}
