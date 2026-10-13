import { CustomerModule } from '../customer/customer.module';
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { PaymentsModule } from '../payments/payments.module';
import { DownloadsService } from './application/downloads.service';
import { DOWNLOAD_LINKS, DOWNLOAD_REPOSITORY } from './application/ports/downloads.ports';
import { PrismaDownloadRepository } from './infrastructure/prisma-download.repository';
import { StorageDownloadLinks } from './infrastructure/storage-download-links';
import { AdminDownloadsController, DownloadsListeners, MyDownloadsController } from './interface/downloads.controllers';

/**
 * HD design downloads: customers buy a design's full-quality images (personal licence).
 * Owns DesignDownload. Its own purchase: never an order, never sent to the workshop.
 */
@Module({
  imports: [CatalogModule, MediaModule, PaymentsModule, CustomerModule],
  controllers: [MyDownloadsController, AdminDownloadsController],
  providers: [
    DownloadsService,
    DownloadsListeners,
    { provide: DOWNLOAD_REPOSITORY, useClass: PrismaDownloadRepository },
    { provide: DOWNLOAD_LINKS, useClass: StorageDownloadLinks },
  ],
})
export class DownloadsModule {}
