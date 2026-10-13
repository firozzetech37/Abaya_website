import type { Prisma } from '@abaya/db';
import type { Db } from '../prisma/prisma.service';

/**
 * Audit actions required by docs/domain-model.md §7 (plus a few extras).
 * Every price change, publish, refund, role change and order-stage change is logged.
 */
export type AuditAction =
  | 'design.created'
  | 'design.updated'
  | 'design.status_changed'
  | 'design.price_changed'
  | 'design.download_changed'
  | 'download.paid'
  | 'design.options_changed'
  | 'option.created'
  | 'option.surcharge_changed'
  | 'option.updated'
  | 'size_band.adjustment_changed'
  | 'reference.updated'
  | 'order.stage_changed'
  | 'order.cancelled'
  | 'order.completed'
  | 'order.refunded'
  | 'order.maker_assigned'
  | 'tech_pack.approved'
  | 'pattern.confirmed'
  | 'cutting.recorded'
  | 'stitching.recorded'
  | 'workshop.team_assigned'
  | 'studio.generation_requested'
  | 'catalog.generation_requested'
  | 'catalog.image_reviewed'
  | 'catalog.model_created'
  | 'qc.recorded'
  | 'refund.created'
  | 'user.roles_changed'
  | 'user.deleted'
  | 'staff.invited'
  | 'staff.invite_cancelled'
  | 'maker.created'
  | 'maker.updated'
  | 'maker.payout_marked_paid';

/** One audit record. Plain data so application use cases can build it. */
export interface AuditEntry {
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

const json = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/** Infrastructure helper: write audit entries inside the caller's transaction. */
export async function writeAudit(db: Db, entries: AuditEntry | AuditEntry[] | undefined): Promise<void> {
  const list = entries === undefined ? [] : Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;
  await db.auditLog.createMany({
    data: list.map((e) => ({
      actorUserId: e.actorUserId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      before: json(e.before),
      after: json(e.after),
      ip: e.ip ?? null,
    })),
  });
}
