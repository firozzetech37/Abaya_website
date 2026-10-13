import { Inject, Injectable } from '@nestjs/common';
import type { AuditLogDto, Paginated } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { ForbiddenError } from '../../../common/errors/domain-error';

export interface AuditLogQuery {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  cursor?: string;
  limit: number;
}

export interface AuditLogReader {
  list(query: AuditLogQuery): Promise<Paginated<AuditLogDto>>;
}
export const AUDIT_LOG_READER = Symbol('AUDIT_LOG_READER');

/**
 * SUPER_ADMIN reads the whole trail. Other staff may read the history of one
 * record (the panels on design and order pages).
 */
@Injectable()
export class AuditLogService {
  constructor(@Inject(AUDIT_LOG_READER) private readonly reader: AuditLogReader) {}

  list(actor: Actor, query: AuditLogQuery): Promise<Paginated<AuditLogDto>> {
    const isAdmin = actor.roles.includes('SUPER_ADMIN');
    if (!isAdmin && !(query.entityType && query.entityId)) {
      throw new ForbiddenError('Only a super admin can browse the full audit log.');
    }
    if (!isAdmin && query.actorUserId) throw new ForbiddenError();
    return this.reader.list(query);
  }
}
