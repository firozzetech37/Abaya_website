import { Injectable } from '@nestjs/common';
import type { Prisma } from '@abaya/db';
import type { MeasurementBody } from '@abaya/contracts';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CartItemRecord,
  CartRepository,
  CustomerDataRepository,
  MeasurementProfileRecord,
  MeasurementRepository,
  WishlistRecord,
  WishlistRepository,
} from '../application/ports/customer.repositories';

type ProfileRow = Prisma.MeasurementProfileGetPayload<object>;
const num = (d: Prisma.Decimal) => Number(d);

const toProfile = (p: ProfileRow): MeasurementProfileRecord => ({
  id: p.id,
  userId: p.userId,
  name: p.name,
  heightCm: num(p.heightCm),
  bustCm: num(p.bustCm),
  waistCm: num(p.waistCm),
  hipCm: num(p.hipCm),
  shoulderCm: num(p.shoulderCm),
  sleeveLengthCm: num(p.sleeveLengthCm),
  fullLengthCm: num(p.fullLengthCm),
  wristCm: p.wristCm === null ? null : num(p.wristCm),
  notes: p.notes,
  source: p.source,
  isDefault: p.isDefault,
  updatedAt: p.updatedAt,
});

@Injectable()
export class PrismaMeasurementRepository implements MeasurementRepository {
  constructor(private readonly db: PrismaService) {}

  async listForUser(userId: string) {
    const rows = await this.db.measurementProfile.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map(toProfile);
  }

  async findForUser(userId: string, id: string) {
    const row = await this.db.measurementProfile.findFirst({ where: { id, userId } });
    return row ? toProfile(row) : null;
  }

  countForUser(userId: string) {
    return this.db.measurementProfile.count({ where: { userId } });
  }

  create(userId: string, input: MeasurementBody) {
    return this.db.$transaction(async (tx) => {
      if (input.isDefault) await tx.measurementProfile.updateMany({ where: { userId }, data: { isDefault: false } });
      return toProfile(await tx.measurementProfile.create({ data: { ...input, userId } }));
    });
  }

  update(userId: string, id: string, input: Partial<MeasurementBody>) {
    return this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.measurementProfile.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } });
      }
      return toProfile(await tx.measurementProfile.update({ where: { id }, data: input }));
    });
  }

  async delete(userId: string, id: string) {
    await this.db.$transaction(async (tx) => {
      const deleted = await tx.measurementProfile.delete({ where: { id } });
      if (deleted.isDefault) {
        const next = await tx.measurementProfile.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } });
        if (next) await tx.measurementProfile.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }
}

const cartItemInclude = { measurementProfile: { select: { name: true } } } satisfies Prisma.CartItemInclude;
type CartItemRow = Prisma.CartItemGetPayload<{ include: typeof cartItemInclude }>;

const toCartItem = (i: CartItemRow): CartItemRecord => ({
  id: i.id,
  designId: i.designId,
  selectedOptionValueIds: i.selectedOptionValueIds,
  sizeBandId: i.sizeBandId,
  measurementProfileId: i.measurementProfileId,
  measurementProfileName: i.measurementProfile?.name ?? null,
  quantity: i.quantity,
  aiPreviewPath: i.aiPreviewPath,
  aiPreviewInspiration: i.aiPreviewInspiration,
  createdAt: i.createdAt,
});

@Injectable()
export class PrismaCartRepository implements CartRepository {
  constructor(private readonly db: PrismaService) {}

  async listItems(userId: string) {
    const rows = await this.db.cartItem.findMany({
      where: { cart: { userId } },
      include: cartItemInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toCartItem);
  }

  async findItem(userId: string, itemId: string) {
    const row = await this.db.cartItem.findFirst({ where: { id: itemId, cart: { userId } }, include: cartItemInclude });
    return row ? toCartItem(row) : null;
  }

  async addItem(
    userId: string,
    item: {
      designId: string;
      selectedOptionValueIds: string[];
      sizeBandId: string | null;
      measurementProfileId: string | null;
      quantity: number;
      aiPreviewPath?: string | null;
      aiPreviewInspiration?: boolean;
    },
  ) {
    const cart = await this.db.cart.upsert({ where: { userId }, update: {}, create: { userId } });
    const row = await this.db.cartItem.create({ data: { ...item, cartId: cart.id }, include: cartItemInclude });
    await this.db.cart.update({ where: { id: cart.id }, data: {} }); // bump updatedAt
    return toCartItem(row);
  }

  async setAiPreview(userId: string, itemId: string, preview: { path: string; inspirationOnly: boolean }) {
    await this.db.cartItem.updateMany({
      where: { id: itemId, cart: { userId } },
      data: { aiPreviewPath: preview.path, aiPreviewInspiration: preview.inspirationOnly },
    });
  }

  async updateQuantity(userId: string, itemId: string, quantity: number) {
    const row = await this.db.cartItem.update({ where: { id: itemId }, data: { quantity }, include: cartItemInclude });
    return toCartItem(row);
  }

  async removeItem(userId: string, itemId: string) {
    await this.db.cartItem.deleteMany({ where: { id: itemId, cart: { userId } } });
  }

  async removeItems(userId: string, itemIds: string[]) {
    if (itemIds.length === 0) return;
    await this.db.cartItem.deleteMany({ where: { id: { in: itemIds }, cart: { userId } } });
  }
}

@Injectable()
export class PrismaWishlistRepository implements WishlistRepository {
  constructor(private readonly db: PrismaService) {}

  list(userId: string): Promise<WishlistRecord[]> {
    return this.db.wishlistItem.findMany({
      where: { userId },
      select: { designId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  count(userId: string) {
    return this.db.wishlistItem.count({ where: { userId } });
  }

  async add(userId: string, designId: string) {
    await this.db.wishlistItem.upsert({
      where: { userId_designId: { userId, designId } },
      update: {},
      create: { userId, designId },
    });
  }

  async remove(userId: string, designId: string) {
    await this.db.wishlistItem.deleteMany({ where: { userId, designId } });
  }
}

@Injectable()
export class PrismaCustomerDataRepository implements CustomerDataRepository {
  constructor(private readonly db: PrismaService) {}

  async exportForUser(userId: string) {
    const [measurementProfiles, cart, wishlist] = await Promise.all([
      this.db.measurementProfile.findMany({ where: { userId } }),
      this.db.cartItem.findMany({ where: { cart: { userId } } }),
      this.db.wishlistItem.findMany({ where: { userId } }),
    ]);
    return {
      measurementProfiles: measurementProfiles.map(toProfile),
      bag: cart,
      wishlist,
    };
  }

  async deleteForUser(userId: string) {
    await this.db.$transaction([
      this.db.cart.deleteMany({ where: { userId } }),
      this.db.wishlistItem.deleteMany({ where: { userId } }),
      this.db.measurementProfile.deleteMany({ where: { userId } }),
    ]);
  }
}

