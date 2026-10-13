import { Inject, Injectable } from '@nestjs/common';
import type { PricingOptionGroup, PricingOptionValue, SizeBandCode } from '@abaya/contracts';
import {
  OPTION_CATALOG_REPOSITORY,
  type OptionCatalogRepository,
  type OptionGroupRecord,
  type OptionValueRecord,
  type SizeBandRecord,
} from './ports/option-catalog.repository';

export interface OptionCatalog {
  groups: OptionGroupRecord[];
  values: OptionValueRecord[];
}

/**
 * Read side of the option catalog (groups, values, size bands). Exported so
 * catalog and customer modules never read pricing tables directly.
 */
@Injectable()
export class OptionCatalogService {
  /** Display pages (shop, design pages) reuse the catalog briefly; prices at checkout never do. */
  private static readonly DISPLAY_CACHE_MS = 30_000;
  private display?: { at: number; value: Promise<{ catalog: OptionCatalog; sizeBands: SizeBandRecord[] }> };

  constructor(@Inject(OPTION_CATALOG_REPOSITORY) private readonly repo: OptionCatalogRepository) {}

  /**
   * Option catalog and active size bands for showing designs, kept for 30 seconds (one trip
   * to the database instead of three on every page). Cleared whenever an option changes.
   * Checkout and validation use getCatalog(), which always reads fresh.
   */
  displayCatalog(now = Date.now()): Promise<{ catalog: OptionCatalog; sizeBands: SizeBandRecord[] }> {
    if (!this.display || now - this.display.at > OptionCatalogService.DISPLAY_CACHE_MS) {
      const value = Promise.all([this.getCatalog(), this.activeSizeBands()]).then(([catalog, sizeBands]) => ({ catalog, sizeBands }));
      this.display = { at: now, value };
      value.catch(() => (this.display = undefined));
    }
    return this.display.value;
  }

  /** An option or size band changed. */
  invalidate(): void {
    this.display = undefined;
  }

  async getCatalog(): Promise<OptionCatalog> {
    const [groups, values] = await Promise.all([this.repo.listGroups(), this.repo.listValues()]);
    return { groups, values };
  }

  findValuesByIds(ids: string[]): Promise<OptionValueRecord[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.repo.findValuesByIds(Array.from(new Set(ids)));
  }

  async activeSizeBands(): Promise<SizeBandRecord[]> {
    return (await this.repo.listSizeBands()).filter((b) => b.isActive);
  }

  findSizeBand(id: string): Promise<SizeBandRecord | null> {
    return this.repo.findSizeBand(id);
  }

  findSizeBandByCode(code: SizeBandCode): Promise<SizeBandRecord | null> {
    return this.repo.findSizeBandByCode(code);
  }

  /** Shapes for calculatePrice() from @abaya/contracts. */
  static toPricingGroups(groups: OptionGroupRecord[]): PricingOptionGroup[] {
    return [...groups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({ code: g.code, name: g.name, selectionType: g.selectionType, isRequired: g.isRequired }));
  }

  static toPricingValues(values: OptionValueRecord[]): PricingOptionValue[] {
    return values.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      groupCode: v.groupCode,
      surchargeInPaise: v.surchargeInPaise,
      isActive: v.isActive,
    }));
  }
}
