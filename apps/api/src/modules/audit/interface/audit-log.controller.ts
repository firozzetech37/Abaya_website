import { Controller, Get } from '@nestjs/common';
import { type AuditLogDto, listAuditLogsQuery, type Paginated } from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { CurrentActor, StaffOnly } from '../../../common/auth/decorators';
import { ZodQuery } from '../../../common/zod/zod-validation.pipe';
import { AuditLogService } from '../application/audit-log.service';

@Controller('admin/audit-logs')
@StaffOnly()
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @ZodQuery(listAuditLogsQuery) query: z.infer<typeof listAuditLogsQuery>,
  ): Promise<Paginated<AuditLogDto>> {
    return this.audit.list(actor, query);
  }
}
