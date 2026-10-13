import { Injectable, Logger } from '@nestjs/common';
import type { ImageCheckResultDto } from '@abaya/contracts';
import { NotFoundError } from '../../../common/errors/domain-error';
import { DesignsAdminService } from '../../catalog/application/designs-admin.service';
import { IdentityService } from '../../identity/application/identity.service';
import { UploadsService } from '../../media/application/uploads.service';
import { TryOnService } from '../../try-on/application/try-on.service';
import { WatermarkService } from '../../watermark/application/watermark.service';

const NOTHING: ImageCheckResultDto = { found: false, kind: null, confidence: null, design: null, request: null, recordGone: false };

/**
 * Admin "Check an image": reads our invisible watermark from a picture found elsewhere and says
 * which design (catalog photo) or which customer request (AI preview, try-on) it came from.
 * The uploaded picture is deleted straight after. Owns no tables.
 */
@Injectable()
export class ImageCheckService {
  private readonly logger = new Logger(ImageCheckService.name);

  constructor(
    private readonly uploads: UploadsService,
    private readonly watermark: WatermarkService,
    private readonly designs: DesignsAdminService,
    private readonly tryOn: TryOnService,
    private readonly identity: IdentityService,
  ) {}

  async check(path: string): Promise<ImageCheckResultDto> {
    const data = await this.uploads.readUpload('IMAGE_CHECK', path);
    if (!data) throw new NotFoundError('Image');
    try {
      const reading = await this.watermark.read(data);
      if (!reading) return NOTHING;
      const base = { ...NOTHING, found: true, kind: reading.kind, confidence: reading.confidence };
      if (reading.kind === 'DESIGN') {
        const design = await this.designs.designByIdPrefix(reading.idPrefix);
        return { ...base, design, recordGone: !design };
      }
      const request = await this.tryOn.requestByIdPrefix(reading.idPrefix);
      if (!request) return { ...base, recordGone: true };
      const [design, contact] = await Promise.all([
        this.designs.designByIdPrefix(request.designId.slice(0, 8)),
        this.identity.getContact(request.userId),
      ]);
      return {
        ...base,
        design,
        request: {
          id: request.id,
          kind: request.kind,
          createdAt: request.createdAt.toISOString(),
          customer: contact ? { id: contact.id, name: contact.name, email: contact.email } : null,
          choices: request.choices,
        },
      };
    } finally {
      await this.uploads.removeUploads('IMAGE_CHECK', [path]).catch((e: unknown) =>
        this.logger.warn({ path, err: e instanceof Error ? e.message : e }, 'Could not delete checked image'),
      );
    }
  }
}
