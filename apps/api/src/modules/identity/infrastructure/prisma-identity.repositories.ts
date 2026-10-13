import { STAFF_ROLES } from '@abaya/contracts';
import { Injectable } from '@nestjs/common';
import { Prisma, type Role } from '@abaya/db';
import type { AddressBody, ConsentPurpose } from '@abaya/contracts';
import { type AuditEntry, writeAudit } from '../../../common/audit/audit';
import { pageArgs, toPage } from '../../../common/pagination';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  AddressRecord,
  AddressRepository,
  ConsentRecordDto,
  ConsentRepository,
  StaffInviteRecord,
  StaffInviteRepository,
  UserRecord,
  UserRepository,
} from '../application/ports/identity.repositories';

const userSelect = {
  id: true,
  authUserId: true,
  email: true,
  phone: true,
  name: true,
  roles: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  lastActiveAt: true,
} satisfies Prisma.UserSelect;

const addressSelect = {
  id: true,
  userId: true,
  fullName: true,
  phone: true,
  line1: true,
  line2: true,
  landmark: true,
  city: true,
  state: true,
  pincode: true,
  country: true,
  isDefault: true,
} satisfies Prisma.AddressSelect;

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Customers have no staff role (staff can shop too, but are not counted as customers). */
function audienceWhere(audience: 'customers' | 'staff' | 'all'): Prisma.UserWhereInput {
  if (audience === 'customers') return { NOT: { roles: { hasSome: [...STAFF_ROLES] } } };
  if (audience === 'staff') return { roles: { hasSome: [...STAFF_ROLES] } };
  return {};
}

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaService) {}

  findByAuthUserId(authUserId: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { authUserId }, select: userSelect });
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { id }, select: userSelect });
  }

  findManyByIds(ids: string[]): Promise<UserRecord[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.user.findMany({ where: { id: { in: ids } }, select: userSelect });
  }

  async touchActive(id: string, at: Date): Promise<void> {
    await this.db.user.update({ where: { id }, data: { lastActiveAt: at } });
  }


  async createCustomer(input: { authUserId: string; email?: string; phone?: string }): Promise<UserRecord> {
    try {
      return await this.db.user.create({
        data: { authUserId: input.authUserId, email: input.email?.toLowerCase(), phone: input.phone },
        select: userSelect,
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // Two parallel first requests: the other one created the row.
      const raced = await this.findByAuthUserId(input.authUserId);
      if (raced) return raced;
      // Email/phone already belong to an older account; never link accounts silently.
      return this.db.user.create({ data: { authUserId: input.authUserId }, select: userSelect });
    }
  }

  updateProfile(id: string, input: { name?: string; phone?: string }): Promise<UserRecord> {
    return this.db.user.update({ where: { id }, data: input, select: userSelect });
  }

  async list(query: { q?: string; role?: Role; audience?: 'customers' | 'staff'; cursor?: string; limit: number }) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { roles: { has: query.role } } : {}),
      ...audienceWhere(query.audience ?? 'all'),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };
    const rows = await this.db.user.findMany({
      where,
      select: userSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(query.cursor, query.limit),
    });
    return toPage(rows, query.limit, (r) => r);
  }

  countAudience(audience: 'customers' | 'staff' | 'all', since?: Date) {
    return this.db.user.count({ where: { deletedAt: null, ...audienceWhere(audience), ...(since ? { createdAt: { gte: since } } : {}) } });
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, isActive: true, deletedAt: null },
      select: userSelect,
    });
  }

  findByPhoneDigits(last10: string): Promise<UserRecord[]> {
    return this.db.user.findMany({
      where: { phone: { endsWith: last10 }, isActive: true, deletedAt: null },
      select: userSelect,
    });
  }

  countWithRole(role: Role): Promise<number> {
    return this.db.user.count({ where: { roles: { has: role }, isActive: true, deletedAt: null } });
  }

  async scrub(id: string, audit: AuditEntry): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.address.deleteMany({ where: { userId: id } });
      await tx.user.update({
        where: { id },
        data: { email: null, phone: null, name: null, roles: ['CUSTOMER'], isActive: false, deletedAt: new Date() },
      });
      await writeAudit(tx, audit);
    });
  }

  async exportForUser(id: string) {
    const [user, addresses, consents] = await Promise.all([
      this.db.user.findUnique({ where: { id }, select: { ...userSelect, authUserId: false } }),
      this.db.address.findMany({ where: { userId: id }, select: { ...addressSelect, userId: false } }),
      this.db.consentRecord.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { profile: user, addresses, consents };
  }

  setRoles(id: string, roles: Role[], audit: AuditEntry): Promise<UserRecord> {
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { roles }, select: userSelect });
      await writeAudit(tx, audit);
      return user;
    });
  }
}


@Injectable()
export class PrismaAddressRepository implements AddressRepository {
  constructor(private readonly db: PrismaService) {}

  listForUser(userId: string): Promise<AddressRecord[]> {
    return this.db.address.findMany({
      where: { userId },
      select: addressSelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findForUser(userId: string, id: string): Promise<AddressRecord | null> {
    return this.db.address.findFirst({ where: { id, userId }, select: addressSelect });
  }

  countForUser(userId: string): Promise<number> {
    return this.db.address.count({ where: { userId } });
  }

  create(userId: string, input: AddressBody): Promise<AddressRecord> {
    return this.db.$transaction(async (tx) => {
      if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({ data: { ...input, userId }, select: addressSelect });
    });
  }

  update(userId: string, id: string, input: Partial<AddressBody>): Promise<AddressRecord> {
    return this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id }, data: input, select: addressSelect });
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const deleted = await tx.address.delete({ where: { id } });
      // Keep one default address when the default one is removed.
      if (deleted.isDefault) {
        const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }
}

@Injectable()
export class PrismaConsentRepository implements ConsentRepository {
  constructor(private readonly db: PrismaService) {}

  async record(
    userId: string,
    version: string,
    consents: { purpose: ConsentPurpose; granted: boolean }[],
    ip?: string,
  ): Promise<void> {
    await this.db.consentRecord.createMany({
      data: consents.map((c) => ({ userId, version, purpose: c.purpose, granted: c.granted, ip: ip ?? null })),
    });
  }

  async latestForUser(userId: string): Promise<ConsentRecordDto[]> {
    const rows = await this.db.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      distinct: ['purpose'],
      select: { purpose: true, granted: true, version: true, createdAt: true },
    });
    return rows;
  }
}

const inviteInclude = { invitedBy: { select: { id: true, name: true, email: true } } } satisfies Prisma.StaffInviteInclude;
type InviteRow = Prisma.StaffInviteGetPayload<{ include: typeof inviteInclude }>;

const toInvite = (r: InviteRow): StaffInviteRecord => ({
  id: r.id,
  email: r.email,
  name: r.name,
  roles: r.roles,
  status: r.status,
  invitedBy: r.invitedBy,
  acceptedUserId: r.acceptedUserId,
  createdAt: r.createdAt,
  acceptedAt: r.acceptedAt,
});

@Injectable()
export class PrismaStaffInviteRepository implements StaffInviteRepository {
  constructor(private readonly db: PrismaService) {}

  async findPendingByEmail(email: string) {
    const row = await this.db.staffInvite.findFirst({ where: { email, status: 'PENDING' }, include: inviteInclude });
    return row ? toInvite(row) : null;
  }

  async list(limit: number) {
    const [pending, others] = await Promise.all([
      this.db.staffInvite.findMany({ where: { status: 'PENDING' }, include: inviteInclude, orderBy: { createdAt: 'desc' } }),
      this.db.staffInvite.findMany({
        where: { status: { not: 'PENDING' } },
        include: inviteInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);
    return [...pending, ...others].map(toInvite);
  }

  async upsertPending(input: { email: string; name: string | null; roles: Role[]; invitedById: string }, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.staffInvite.findFirst({ where: { email: input.email, status: 'PENDING' } });
      const row = existing
        ? await tx.staffInvite.update({
            where: { id: existing.id },
            data: { roles: input.roles, name: input.name, invitedById: input.invitedById },
            include: inviteInclude,
          })
        : await tx.staffInvite.create({ data: input, include: inviteInclude });
      await writeAudit(tx, { ...audit, entityId: row.id });
      return toInvite(row);
    });
  }

  async cancel(id: string, audit: AuditEntry) {
    return this.db.$transaction(async (tx) => {
      const updated = await tx.staffInvite.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (updated.count === 0) return null;
      await writeAudit(tx, audit);
      return toInvite(await tx.staffInvite.findUniqueOrThrow({ where: { id }, include: inviteInclude }));
    });
  }

  async accept(inviteId: string, user: { id: string; roles: Role[]; name: string | null; inviteName: string | null }, audit: AuditEntry) {
    await this.db.$transaction(async (tx) => {
      // Only one request may accept an invite (first sign-in can fire several requests at once).
      const closed = await tx.staffInvite.updateMany({
        where: { id: inviteId, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedUserId: user.id, acceptedAt: new Date() },
      });
      if (closed.count === 0) return;
      await tx.user.update({
        where: { id: user.id },
        data: { roles: user.roles, ...(user.name ? {} : user.inviteName ? { name: user.inviteName } : {}) },
      });
      await writeAudit(tx, audit);
    });
  }
}
