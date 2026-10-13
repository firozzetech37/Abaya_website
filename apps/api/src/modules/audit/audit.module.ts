import { Module } from '@nestjs/common';
import { AUDIT_LOG_READER, AuditLogService } from './application/audit-log.service';
import { PrismaAuditLogReader } from './infrastructure/prisma-audit-log.reader';
import { AuditLogController } from './interface/audit-log.controller';

/** Read side of AuditLog. Writes happen inside each module's transactions (common/audit). */
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService, { provide: AUDIT_LOG_READER, useClass: PrismaAuditLogReader }],
})
export class AuditModule {}
