import { OrderingService } from '../../customer/application/ordering.service';
import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminDownloadDto,
  type AdminDownloadsSummaryDto,
  type CreateDownloadResponse,
  DOWNLOAD_LINK_TTL_SECONDS,
  type DownloadDto,
  type DownloadLinkDto,
  type DownloadStatus,
  type Paginated,
} from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import type { PaymentCapturedEvent } from '../../../common/events/events';
import { DesignsAdminService } from '../../catalog/application/designs-admin.service';
import { UploadsService } from '../../media/application/uploads.service';
import { PaymentsService } from '../../payments/application/payments.service';
import { downloadFileName, licenceCode, licenceNotice, stampedPath } from '../domain/download.rules';
import { DOWNLOAD_LINKS, DOWNLOAD_REPOSITORY, type DownloadLinks, type DownloadRecord, type DownloadRepository } from './ports/downloads.ports';

/** India day start (UTC+5:30) for "paid today". */
const startOfIndiaDay = (now: Date) => {
  const offset = 330 * 60_000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
};

/**
 * HD design downloads (docs/apps/web.md "HD download"): a customer buys a published design's
 * full-quality images. Its own purchase and payment; never an abaya order or workshop job.
 */
@Injectable()
export class DownloadsService {
  constructor(
    @Inject(DOWNLOAD_REPOSITORY) private readonly downloads: DownloadRepository,
    @Inject(DOWNLOAD_LINKS) private readonly links: DownloadLinks,
    private readonly catalog: DesignsAdminService,
    private readonly payments: PaymentsService,
    private readonly uploads: UploadsService,
    private readonly ordering: OrderingService,
  ) {}

  /** Start a purchase. The price always comes from the catalog, never from the client. */
  async create(actor: Actor, designId: string): Promise<CreateDownloadResponse> {
    this.ordering.assertOpen(); // HD downloads are paid too: closed while ordering is "coming soon"
    const subject = await this.catalog.downloadSubject(designId);
    if (!subject) throw new NotFoundError('Design download');
    const already = await this.downloads.findPaid(actor.userId, designId);
    if (already) {
      throw new BusinessRuleError('ALREADY_PURCHASED', 'You already bought this design. Find it in My downloads.', {
        downloadId: already.id,
      });
    }
    const download = await this.downloads.create({
      userId: actor.userId,
      designId,
      design: { name: subject.name, slug: subject.slug, style: subject.style },
      imagePaths: subject.imagePaths,
      priceInPaise: subject.priceInPaise,
      licenceAcceptedAt: new Date(),
    });
    const payment = await this.payments.createForDownload({
      id: download.id,
      receipt: licenceCode(download.id),
      amountInPaise: download.priceInPaise,
    });
    return { downloadId: download.id, priceInPaise: download.priceInPaise, ...payment };
  }

  /** Development "Simulate payment" (PAYMENT_PROVIDER=fake). */
  async simulatePayment(actor: Actor, id: string): Promise<DownloadDto> {
    const download = await this.requireOwn(actor, id);
    if (download.status !== 'PAID') await this.payments.simulateDownloadCapture(id);
    return this.get(actor, id);
  }

  async handlePaymentCaptured(event: PaymentCapturedEvent): Promise<void> {
    if (!event.downloadId) return;
    const download = await this.downloads.findById(event.downloadId);
    if (!download) return;
    await this.downloads.markPaid(download.id, new Date(), {
      actorUserId: download.userId,
      action: 'download.paid',
      entityType: 'DesignDownload',
      entityId: download.id,
      after: { designId: download.designId, priceInPaise: download.priceInPaise, paymentId: event.paymentId },
    });
  }

  async listMine(actor: Actor): Promise<DownloadDto[]> {
    return (await this.downloads.listPaid(actor.userId)).map((d) => this.toDto(d));
  }

  async get(actor: Actor, id: string): Promise<DownloadDto> {
    return this.toDto(await this.requireOwn(actor, id));
  }

  /** A fresh 10-minute link to one licensed HD file (stamped with the licence each time). */
  async link(actor: Actor, id: string, index: number): Promise<DownloadLinkDto> {
    const download = await this.requireOwn(actor, id);
    if (download.status !== 'PAID') throw new BusinessRuleError('NOT_PAID', 'This download has not been paid for yet.');
    const source = download.imagePaths[index];
    if (source === undefined) throw new NotFoundError('Image');
    const path = stampedPath(download.id, index);
    const made = await this.uploads.stampedCopy(
      source,
      path,
      licenceNotice({ downloadId: download.id, userId: download.userId, designName: download.design.name }),
    );
    if (!made) throw new BusinessRuleError('FILE_UNAVAILABLE', 'This image is not available right now. Please contact us.');
    const fileName = downloadFileName(download.design.slug, index);
    return { url: await this.links.signed(path, fileName, DOWNLOAD_LINK_TTL_SECONDS), fileName, expiresInSeconds: DOWNLOAD_LINK_TTL_SECONDS };
  }

  async listAdmin(query: { status?: DownloadStatus; cursor?: string; limit: number }): Promise<Paginated<AdminDownloadDto>> {
    const page = await this.downloads.listAdmin(query);
    return {
      items: page.items.map((d) => ({
        id: d.id,
        status: d.status,
        customer: d.customer,
        design: { id: d.designId, name: d.design.name, slug: d.design.slug },
        priceInPaise: d.priceInPaise,
        paidAt: d.paidAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async summary(now = new Date()): Promise<AdminDownloadsSummaryDto> {
    const t = await this.downloads.paidTotals(startOfIndiaDay(now));
    return { paidCount: t.paidCount, revenueInPaise: t.revenueInPaise, paidToday: t.paidSince };
  }

  private async requireOwn(actor: Actor, id: string): Promise<DownloadRecord> {
    const download = await this.downloads.findById(id);
    if (!download || download.userId !== actor.userId) throw new NotFoundError('Download');
    return download;
  }

  private toDto(d: DownloadRecord): DownloadDto {
    const first = d.imagePaths[0];
    return {
      id: d.id,
      status: d.status,
      design: { id: d.designId, ...d.design },
      previewUrl: first ? this.catalog.previewUrl(first) : null,
      imageCount: d.imagePaths.length,
      priceInPaise: d.priceInPaise,
      paidAt: d.paidAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
