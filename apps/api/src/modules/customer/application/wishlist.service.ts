import { Inject, Injectable } from '@nestjs/common';
import type { WishlistItemDto } from '@abaya/contracts';
import { NotFoundError } from '../../../common/errors/domain-error';
import { CatalogService } from '../../catalog/application/catalog.service';
import { assertLimit, MAX_WISHLIST_ITEMS } from '../domain/customer.rules';
import { WISHLIST_REPOSITORY, type WishlistRepository } from './ports/customer.repositories';

@Injectable()
export class WishlistService {
  constructor(
    @Inject(WISHLIST_REPOSITORY) private readonly wishlist: WishlistRepository,
    private readonly catalog: CatalogService,
  ) {}

  async list(userId: string): Promise<WishlistItemDto[]> {
    const rows = await this.wishlist.list(userId);
    const cards = await this.catalog.getCards(rows.map((r) => r.designId));
    return rows.flatMap((r) => {
      const card = cards.get(r.designId);
      if (!card) return [];
      return [
        {
          designId: card.id,
          slug: card.slug,
          name: card.name,
          style: card.style,
          fromPriceInPaise: card.fromPriceInPaise,
          // Unpublished designs stay in the list but without an image or link.
          primaryImageUrl: card.isPublished ? card.primaryImageUrl : null,
          available: card.isPublished,
          addedAt: r.createdAt.toISOString(),
        },
      ];
    });
  }

  async add(userId: string, designId: string): Promise<WishlistItemDto[]> {
    const card = (await this.catalog.getCards([designId])).get(designId);
    if (!card || !card.isPublished) throw new NotFoundError('Design');
    assertLimit(await this.wishlist.count(userId), MAX_WISHLIST_ITEMS, 'saved designs');
    await this.wishlist.add(userId, designId);
    return this.list(userId);
  }

  async remove(userId: string, designId: string): Promise<void> {
    await this.wishlist.remove(userId, designId);
  }
}
