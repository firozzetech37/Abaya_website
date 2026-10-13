import { OrderingService } from './ordering.service';
import { UploadsService } from '../../media/application/uploads.service';
import { TryOnService } from '../../try-on/application/try-on.service';
import { Inject, Injectable } from '@nestjs/common';
import type { CartDto, CartItemDto, QuoteBody } from '@abaya/contracts';
import { BusinessRuleError, DomainError, NotFoundError } from '../../../common/errors/domain-error';
import { CatalogService } from '../../catalog/application/catalog.service';
import { OptionCatalogService } from '../../pricing/application/option-catalog.service';
import { type DetailedQuote, PricingService } from '../../pricing/application/pricing.service';
import { assertLimit, MAX_CART_ITEMS } from '../domain/customer.rules';
import { MeasurementsService } from './measurements.service';
import { CART_REPOSITORY, type CartItemRecord, type CartRepository } from './ports/customer.repositories';

const sameSelection = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export interface QuotedCartItem {
  item: CartItemRecord;
  quote: DetailedQuote | null;
  problem: string | null;
}

/** The bag. Stores choices only; every read re-quotes on the server. */
@Injectable()
export class CartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cart: CartRepository,
    private readonly pricing: PricingService,
    private readonly options: OptionCatalogService,
    private readonly catalog: CatalogService,
    private readonly measurements: MeasurementsService,
    private readonly tryOn: TryOnService,
    private readonly uploads: UploadsService,
    private readonly ordering: OrderingService,
  ) {}

  async get(userId: string): Promise<CartDto> {
    const quoted = await this.quoteAll(userId);
    const [cards, bands, values] = await Promise.all([
      this.catalog.getCards(quoted.map((q) => q.item.designId)),
      this.options.activeSizeBands(),
      this.options.findValuesByIds(quoted.flatMap((q) => q.item.selectedOptionValueIds)),
    ]);
    const { groups } = await this.options.getCatalog();
    const groupName = new Map(groups.map((g) => [g.code, g.name]));
    const valueById = new Map(values.map((v) => [v.id, v]));
    const bandById = new Map(bands.map((b) => [b.id, b]));

    const items: CartItemDto[] = quoted.map(({ item, quote, problem }) => {
      const card = cards.get(item.designId);
      const band = item.sizeBandId ? bandById.get(item.sizeBandId) : undefined;
      return {
        id: item.id,
        design: {
          id: item.designId,
          slug: card?.slug ?? '',
          name: card?.name ?? 'Unavailable design',
          primaryImageUrl: card?.isPublished ? card.primaryImageUrl : null,
        },
        selectedOptions:
          quote?.selectedOptions ??
          item.selectedOptionValueIds.flatMap((id) => {
            const v = valueById.get(id);
            return v
              ? [{ groupCode: v.groupCode, groupName: groupName.get(v.groupCode) ?? v.groupCode, valueId: v.id, valueName: v.name, surchargeInPaise: v.surchargeInPaise }]
              : [];
          }),
        selectedOptionValueIds: item.selectedOptionValueIds,
        size: item.measurementProfileId
          ? { kind: 'MEASUREMENTS', measurementProfileId: item.measurementProfileId, profileName: item.measurementProfileName ?? 'My measurements' }
          : { kind: 'BAND', sizeBandId: item.sizeBandId ?? '', code: band?.code ?? 'M', label: band?.label ?? 'Size unavailable' },
        quantity: item.quantity,
        price: quote?.breakdown ?? null,
        problem,
      };
    });

    return {
      items,
      subtotalInPaise: items.reduce((sum, i) => sum + (i.price?.totalInPaise ?? 0), 0),
      canCheckout: items.length > 0 && items.every((i) => i.price && !i.problem),
    };
  }

  async addItem(userId: string, input: QuoteBody): Promise<CartDto> {
    this.ordering.assertOpen(); // "Ordering coming soon"
    if (input.measurementProfileId) await this.measurements.requireOwn(userId, input.measurementProfileId);
    await this.pricing.quote(input); // throws if the design or selection is not orderable

    const items = await this.cart.listItems(userId);
    const existing = items.find(
      (i) =>
        i.designId === input.designId &&
        i.sizeBandId === (input.sizeBandId ?? null) &&
        i.measurementProfileId === (input.measurementProfileId ?? null) &&
        sameSelection(i.selectedOptionValueIds, input.selectedOptionValueIds),
    );
    // Her matching AI preview goes with the item to the workshop (a copy: hers is deleted after an hour).
    const keepPreview = () => this.tryOn.previewForOrder(userId, input.designId, input.selectedOptionValueIds).catch(() => null);
    if (existing) {
      await this.cart.updateQuantity(userId, existing.id, Math.min(10, existing.quantity + input.quantity));
      if (!existing.aiPreviewPath) {
        const preview = await keepPreview();
        if (preview) await this.cart.setAiPreview(userId, existing.id, preview);
      }
    } else {
      assertLimit(items.length, MAX_CART_ITEMS, 'items in your bag');
      const preview = await keepPreview();
      await this.cart.addItem(userId, {
        designId: input.designId,
        selectedOptionValueIds: input.selectedOptionValueIds,
        sizeBandId: input.sizeBandId ?? null,
        measurementProfileId: input.measurementProfileId ?? null,
        quantity: input.quantity,
        aiPreviewPath: preview?.path ?? null,
        aiPreviewInspiration: preview?.inspirationOnly ?? false,
      });
    }
    return this.get(userId);
  }

  async updateQuantity(userId: string, itemId: string, quantity: number): Promise<CartDto> {
    if (!(await this.cart.findItem(userId, itemId))) throw new NotFoundError('Bag item');
    await this.cart.updateQuantity(userId, itemId, quantity);
    return this.get(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartDto> {
    const item = await this.cart.findItem(userId, itemId);
    if (!item) throw new NotFoundError('Bag item');
    await this.cart.removeItem(userId, itemId);
    await this.dropPreviews([item]);
    return this.get(userId);
  }

  /** For checkout: every item with a fresh quote. Throws when anything cannot be ordered. */
  async quoteForCheckout(userId: string): Promise<QuotedCartItem[]> {
    const quoted = await this.quoteAll(userId);
    if (quoted.length === 0) throw new BusinessRuleError('CART_EMPTY', 'Your bag is empty.');
    const problems = quoted.filter((q) => !q.quote || q.problem);
    if (problems.length > 0) {
      throw new BusinessRuleError(
        'CART_NOT_READY',
        'Some items in your bag need attention before checkout.',
        problems.map((p) => ({ itemId: p.item.id, problem: p.problem })),
      );
    }
    return quoted;
  }

  async removeItems(userId: string, itemIds: string[]): Promise<void> {
    const gone = (await this.cart.listItems(userId)).filter((i) => itemIds.includes(i.id));
    await this.cart.removeItems(userId, itemIds);
    await this.dropPreviews(gone);
  }

  async removeItemsAddedBefore(userId: string, before: Date): Promise<void> {
    const gone = (await this.cart.listItems(userId)).filter((i) => i.createdAt <= before);
    await this.cart.removeItems(
      userId,
      gone.map((i) => i.id),
    );
    await this.dropPreviews(gone);
  }

  /** The bag's AI preview copies go with the items (an order keeps its own copy). */
  private async dropPreviews(items: CartItemRecord[]): Promise<void> {
    const paths = items.flatMap((i) => (i.aiPreviewPath ? [i.aiPreviewPath] : []));
    if (paths.length > 0) await this.uploads.removeUploads('ORDER_AI_PREVIEW', paths).catch(() => undefined);
  }

  private async quoteAll(userId: string): Promise<QuotedCartItem[]> {
    const items = await this.cart.listItems(userId);
    return Promise.all(
      items.map(async (item): Promise<QuotedCartItem> => {
        if (!item.sizeBandId && !item.measurementProfileId) {
          return { item, quote: null, problem: 'Choose a size or measurements again.' };
        }
        try {
          const quote = await this.pricing.quoteDetailed({
            designId: item.designId,
            selectedOptionValueIds: item.selectedOptionValueIds,
            sizeBandId: item.sizeBandId ?? undefined,
            measurementProfileId: item.measurementProfileId ?? undefined,
            quantity: item.quantity,
          });
          return { item, quote, problem: null };
        } catch (e) {
          if (e instanceof DomainError) return { item, quote: null, problem: e.message };
          throw e;
        }
      }),
    );
  }
}
