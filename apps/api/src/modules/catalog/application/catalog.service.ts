import { Inject, Injectable } from '@nestjs/common';
import type { AbayaStyle, DesignStatus } from '@abaya/contracts';
import { OptionCatalogService } from '../../pricing/application/option-catalog.service';
import { CatalogQueryService, primaryImage } from './catalog-query.service';
import {
  CATALOG_IMAGE_STORAGE,
  type CatalogImageStorage,
  DESIGN_REPOSITORY,
  type DesignOptionRecord,
  type DesignRepository,
} from './ports/catalog.ports';

export interface DesignPricingInfo {
  id: string;
  name: string;
  slug: string;
  status: DesignStatus;
  basePriceInPaise: number | null;
  allowed: DesignOptionRecord[];
}

/** Stored on OrderItem.designSnapshot; never changes after checkout. */
export interface DesignSnapshot {
  id: string;
  name: string;
  slug: string;
  style: AbayaStyle;
  primaryImagePath: string | null;
  leadTimeDays: number;
}

export interface DesignCardView {
  id: string;
  slug: string;
  name: string;
  style: AbayaStyle;
  fromPriceInPaise: number;
  primaryImageUrl: string | null;
  isPublished: boolean;
}

/** Catalog's exported application service (docs/apps/api.md "Module contracts"). */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(DESIGN_REPOSITORY) private readonly designs: DesignRepository,
    @Inject(CATALOG_IMAGE_STORAGE) private readonly images: CatalogImageStorage,
    private readonly options: OptionCatalogService,
    private readonly query: CatalogQueryService,
  ) {}

  async getPricingInfo(designId: string): Promise<DesignPricingInfo | null> {
    const d = await this.designs.findById(designId);
    if (!d) return null;
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      status: d.status,
      basePriceInPaise: d.basePriceInPaise,
      allowed: d.options,
    };
  }

  async snapshot(designId: string): Promise<DesignSnapshot | null> {
    const d = await this.designs.findById(designId);
    if (!d) return null;
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      style: d.style,
      primaryImagePath: primaryImage(d)?.storagePath ?? null,
      leadTimeDays: d.leadTimeDays,
    };
  }

  /** Cards for wishlist/cart rows, including designs that are no longer published. */
  async getCards(ids: string[]): Promise<Map<string, DesignCardView>> {
    if (ids.length === 0) return new Map();
    const [rows, catalog] = await Promise.all([
      this.designs.findManyByIds(Array.from(new Set(ids))),
      this.options.getCatalog(),
    ]);
    return new Map(
      rows.map((d) => [d.id, { ...this.query.toCard(d, catalog), isPublished: d.status === 'PUBLISHED' }]),
    );
  }

  /** Public URL of a design image stored in a snapshot (published images only). */
  imageUrl(storagePath: string | null): string | null {
    return storagePath ? this.images.publicUrl(storagePath) : null;
  }

  /** Internal cost to make one abaya (never sent to customers); used for tailor payouts. */
  async getMakingCost(designId: string): Promise<number | null> {
    return (await this.designs.findById(designId))?.makingCostInPaise ?? null;
  }

  countAwaitingReview(): Promise<number> {
    return this.designs.countByStatus('IN_REVIEW');
  }
}
