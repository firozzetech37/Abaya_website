import { Inject, Injectable } from '@nestjs/common';
import { ABAYA_STYLES, downloadPriceOf } from '@abaya/contracts';
import type {
  CollectionDto,
  DesignCard,
  DesignFacets,
  DesignFacetsQuery,
  DesignDetail,
  ListDesignsQuery,
  Paginated,
} from '@abaya/contracts';
import { NotFoundError } from '../../../common/errors/domain-error';
import { type OptionCatalog, OptionCatalogService } from '../../pricing/application/option-catalog.service';
import { fromPrice } from '../domain/from-price';
import { isNewArrival } from '../domain/new-arrival';
import { allowedActiveValues } from './design-options.view';
import {
  CATALOG_IMAGE_STORAGE,
  type CatalogImageStorage,
  COLLECTION_REPOSITORY,
  type CollectionRecord,
  type CollectionRepository,
  DESIGN_REPOSITORY,
  type DesignRecord,
  type DesignRepository,
} from './ports/catalog.ports';

/** Active colours with a swatch colour, in the admin's order. */
const activeColours = (catalog: OptionCatalog) =>
  catalog.values.filter((v) => v.groupCode === 'COLOUR' && v.isActive && v.colourHex).sort((a, b) => a.sortOrder - b.sortOrder);

/** The colour filter as option value ids: undefined when not filtering, empty when the code is unknown. */
const colourIdsFor = (code: string | undefined, catalog: OptionCatalog) =>
  code === undefined ? undefined : activeColours(catalog).filter((c) => c.code === code).map((c) => c.id);

export const primaryImage = (d: Pick<DesignRecord, 'images'>) =>
  d.images.find((i) => i.isPrimary) ??
  [...d.images].sort((a, b) => a.sortOrder - b.sortOrder).find((i) => !i.isDetail) ??
  [...d.images].sort((a, b) => a.sortOrder - b.sortOrder)[0] ??
  null;

/** Public storefront reads. Only PUBLISHED designs, only public image URLs. */
@Injectable()
export class CatalogQueryService {
  constructor(
    @Inject(DESIGN_REPOSITORY) private readonly designs: DesignRepository,
    @Inject(COLLECTION_REPOSITORY) private readonly collections: CollectionRepository,
    @Inject(CATALOG_IMAGE_STORAGE) private readonly images: CatalogImageStorage,
    private readonly options: OptionCatalogService,
  ) {}

  async list(query: ListDesignsQuery): Promise<Paginated<DesignCard>> {
    const { catalog } = await this.options.displayCatalog();
    const page = await this.designs.listPublished(query, colourIdsFor(query.colour, catalog));
    return { items: page.items.map((d) => this.toCard(d, catalog)), nextCursor: page.nextCursor };
  }

  /** How many published designs each style and colour would show with the other filters kept. */
  async facets(query: DesignFacetsQuery): Promise<DesignFacets> {
    const { catalog } = await this.options.displayCatalog();
    const colours = activeColours(catalog);
    const found = await this.designs.facets(query, colourIdsFor(query.colour, catalog), colours.map((c) => c.id));
    const countOf = new Map(found.colourCounts.map((c) => [c.optionValueId, c.count]));
    const styles = ABAYA_STYLES.map((style) => {
      const row = found.styles.find((s) => s.style === style);
      return {
        style,
        count: row?.count ?? 0,
        imageUrl: row?.image ? this.images.publicUrl(row.image.storagePath, row.image.previewVersion) : null,
      };
    });
    return {
      total: query.style ? (styles.find((s) => s.style === query.style)?.count ?? 0) : styles.reduce((n, s) => n + s.count, 0),
      styles,
      colours: colours
        .map((c) => ({ code: c.code, name: c.name, hex: c.colourHex!, count: countOf.get(c.id) ?? 0 }))
        .filter((c) => c.count > 0),
    };
  }

  async getBySlug(slug: string): Promise<DesignDetail> {
    // The design and the (briefly cached) option catalog are read at the same time.
    const [design, { catalog, sizeBands }] = await Promise.all([this.designs.findBySlug(slug), this.options.displayCatalog()]);
    if (!design || design.status !== 'PUBLISHED') throw new NotFoundError('Design');
    const allowed = allowedActiveValues(design, catalog);
    const offeredColours = new Set(allowed.filter((a) => a.value.groupCode === 'COLOUR').map((a) => a.value.id));

    const optionGroups = [...catalog.groups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({
        code: g.code,
        name: g.name,
        selectionType: g.selectionType,
        isRequired: g.isRequired,
        values: allowed
          .filter((a) => a.value.groupCode === g.code)
          .map((a) => ({
            id: a.value.id,
            code: a.value.code,
            name: a.value.name,
            surchargeInPaise: a.surchargeInPaise,
            colourHex: a.value.colourHex,
            swatchImageUrl: this.images.swatchUrl(a.value.swatchImagePath),
            isDefault: a.isDefault,
          })),
      }))
      .filter((g) => g.values.length > 0);

    return {
      ...this.toCard(design, catalog),
      description: design.description,
      tags: design.tags,
      basePriceInPaise: design.basePriceInPaise ?? 0,
      leadTimeDays: design.leadTimeDays,
      images: [...design.images]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
        .map((i) => ({
          url: this.images.publicUrl(i.storagePath, i.previewVersion),
          alt: i.alt,
          // A photo tagged with a colour the design no longer offers counts as a main photo.
          colourId: i.colourValueId && offeredColours.has(i.colourValueId) ? i.colourValueId : null,
        })),
      optionGroups,
      sizeBands: sizeBands.map((b) => ({
        id: b.id,
        code: b.code,
        label: b.label,
        adjustmentInPaise: b.adjustmentInPaise,
        bustMinCm: b.bustMinCm,
        bustMaxCm: b.bustMaxCm,
      })),
      download:
        design.downloadEnabled && design.images.length > 0
          ? { priceInPaise: downloadPriceOf(design), imageCount: design.images.length }
          : null,
    };
  }

  async listCollections(): Promise<CollectionDto[]> {
    return (await this.collections.list(true)).map((c) => this.toPublicCollection(c));
  }

  async getCollection(slug: string): Promise<CollectionDto> {
    const c = await this.collections.findBySlug(slug);
    if (!c || !c.isActive) throw new NotFoundError('Collection');
    return this.toPublicCollection(c);
  }

  toCard(design: DesignRecord, catalog: OptionCatalog): DesignCard {
    const allowed = allowedActiveValues(design, catalog);
    const image = primaryImage(design);
    const ordered = [...design.images].sort((a, b) => a.sortOrder - b.sortOrder);
    // The second photo (another angle, never a close-up) is shown when the card is hovered.
    const hover = ordered.find((i) => i.id !== image?.id && !i.isDetail) ?? null;
    const wide = ordered.find((i) => i.width && i.height && i.width > i.height && !i.isDetail) ?? null;
    const details = ordered.filter((i) => i.isDetail);
    const colours = allowed
      .filter((a) => a.value.groupCode === 'COLOUR' && a.value.colourHex)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      .map((a) => a.value.colourHex!)
      .slice(0, 6);
    return {
      id: design.id,
      slug: design.slug,
      name: design.name,
      style: design.style,
      collectionName: design.collections.find((c) => c.isActive)?.name ?? null,
      isNew: isNewArrival(design.publishedAt),
      fromPriceInPaise: fromPrice(
        design.basePriceInPaise ?? 0,
        catalog.groups,
        allowed.map((a) => ({ groupCode: a.value.groupCode, surchargeInPaise: a.surchargeInPaise, isDefault: a.isDefault })),
      ),
      primaryImageUrl: image ? this.images.publicUrl(image.storagePath, image.previewVersion) : null,
      primaryImageWidth: image?.width ?? null,
      hoverImageUrl: hover ? this.images.publicUrl(hover.storagePath, hover.previewVersion) : null,
      wideImageUrl: wide ? this.images.publicUrl(wide.storagePath, wide.previewVersion) : null,
      colours,
      detailImageUrls: details.map((i) => this.images.publicUrl(i.storagePath, i.previewVersion)),
      leadTimeDays: design.leadTimeDays,
    };
  }

  /** Public view: counts only published designs and never lists member ids. */
  private toPublicCollection(c: CollectionRecord): CollectionDto {
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      isActive: c.isActive,
      sortOrder: c.sortOrder,
      designCount: c.publishedDesignCount,
      coverImageUrl: c.cover ? this.images.publicUrl(c.cover.storagePath, c.cover.previewVersion) : null,
      videoUrl: c.videoPath ? this.images.publicUrl(c.videoPath) : null,
      previewImageUrls: c.previews.map((p) => this.images.publicUrl(p.storagePath, p.previewVersion)),
    };
  }
}
