import { Injectable } from '@nestjs/common';
import type { NotificationChannel, Prisma } from '@abaya/db';
import type { ClientApp, DevicePlatform } from '@abaya/contracts';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  ClaimedNotification,
  DeviceRepository,
  NotificationOutbox,
  OutgoingNotification,
} from '../application/ports/notify.ports';

/** How long a claimed row is hidden from other workers while it is being sent. */
const LEASE = '5 minutes';
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const clip = (s: string) => s.slice(0, 1000);

@Injectable()
export class PrismaNotificationOutbox implements NotificationOutbox {
  constructor(private readonly db: PrismaService) {}

  async enqueue(items: OutgoingNotification[]): Promise<number> {
    const result = await this.db.notification.createMany({
      data: items.map((i) => ({
        userId: i.userId,
        channel: i.channel as NotificationChannel,
        template: i.template,
        payload: json(i.payload),
        dedupeKey: i.dedupeKey ?? null,
      })),
      skipDuplicates: true, // dedupeKey is unique
    });
    return result.count;
  }

  async claimDue(limit: number): Promise<ClaimedNotification[]> {
    // One statement, so it also works through the Supabase transaction pooler.
    return this.db.$queryRaw<ClaimedNotification[]>`
      UPDATE "Notification" n
      SET "attempts" = n."attempts" + 1,
          "nextAttemptAt" = now() + ${LEASE}::interval
      WHERE n.id IN (
        SELECT id FROM "Notification"
        WHERE status = 'QUEUED' AND "nextAttemptAt" <= now()
        ORDER BY "nextAttemptAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING n.id, n."userId", n.channel::text AS channel, n.template, n.payload, n.attempts`;
  }

  async markSent(id: string): Promise<void> {
    await this.db.notification.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), error: null } });
  }

  async markRetry(id: string, nextAttemptAt: Date, error: string): Promise<void> {
    await this.db.notification.update({ where: { id }, data: { nextAttemptAt, error: clip(error) } });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db.notification.update({ where: { id }, data: { status: 'FAILED', error: clip(error) } });
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.db.notification.deleteMany({ where: { userId } });
  }
}

@Injectable()
export class PrismaDeviceRepository implements DeviceRepository {
  constructor(private readonly db: PrismaService) {}

  async upsert(userId: string, input: { token: string; platform: DevicePlatform; app: ClientApp }): Promise<void> {
    await this.db.deviceToken.upsert({
      where: { token: input.token },
      create: { userId, ...input },
      update: { userId, platform: input.platform, app: input.app, lastSeenAt: new Date() },
    });
  }

  async remove(userId: string, token: string): Promise<void> {
    await this.db.deviceToken.deleteMany({ where: { userId, token } });
  }

  async tokensFor(userId: string, app: ClientApp): Promise<string[]> {
    const rows = await this.db.deviceToken.findMany({ where: { userId, app }, select: { token: true } });
    return rows.map((r) => r.token);
  }

  async removeTokens(tokens: string[]): Promise<void> {
    if (tokens.length > 0) await this.db.deviceToken.deleteMany({ where: { token: { in: tokens } } });
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.db.deviceToken.deleteMany({ where: { userId } });
  }
}

