import { Injectable } from '@nestjs/common';
import {
  calculatePrice,
  type OptionGroupCode,
  type PriceBreakdown,
  PricingError,
  type SizeBandCode,
} from '@abaya/contracts';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import { CatalogService } from '../../catalog/application/catalog.service';
import { OptionCatalogService } from './option-catalog.service';

export interface QuoteInput {
  designId: string;
  selectedOptionValueIds: string[];
  sizeBandId?: string;
  measurementProfileId?: string;
  quantity: number;
}

export interface DetailedQuote {
  breakdown: PriceBreakdown;
  design: { id: string; name: string; slug: string };
  sizeBand: { id: string; code: SizeBandCode; label: string };
  /** Selected values with the surcharge actually charged, for order snapshots. */
  selectedOptions: {
    groupCode: OptionGroupCode;
    groupName: string;
    valueId: string;
    valueName: string;
    surchargeInPaise: number;
  }[];
}

/**
 * PricingService.quote (docs/apps/api.md). The API always recalculates with
 * calculatePrice() from @abaya/contracts; prices sent by clients are ignored.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly options: OptionCatalogService,
  ) {}

  async quote(input: QuoteInput): Promise<PriceBreakdown> {
    return (await this.quoteDetailed(input)).breakdown;
  }

  async quoteDetailed(input: QuoteInput): Promise<DetailedQuote> {
    const design = await this.catalog.getPricingInfo(input.designId);
    if (!design) throw new NotFoundError('Design');
    if (design.status !== 'PUBLISHED') {
      throw new BusinessRuleError('DESIGN_NOT_PUBLISHED', 'This design is not available.');
    }
    if (design.basePriceInPaise === null) {
      throw new BusinessRuleError('PRICE_NOT_SET', 'This design has no price yet.');
    }

    const sizeBand = input.measurementProfileId
      ? await this.options.findSizeBandByCode('CUSTOM')
      : input.sizeBandId
        ? await this.options.findSizeBand(input.sizeBandId)
        : null;
    if (!sizeBand || !sizeBand.isActive) {
      throw new BusinessRuleError('INVALID_SIZE', 'Choose an available size.');
    }

    const { groups } = await this.options.getCatalog();
    const values = await this.options.findValuesByIds([
      ...design.allowed.map((a) => a.optionValueId),
      ...input.selectedOptionValueIds,
    ]);

    let breakdown: PriceBreakdown;
    try {
      breakdown = calculatePrice({
        basePriceInPaise: design.basePriceInPaise,
        groups: OptionCatalogService.toPricingGroups(groups),
        values: OptionCatalogService.toPricingValues(values),
        allowed: design.allowed,
        selectedOptionValueIds: input.selectedOptionValueIds,
        sizeBandAdjustmentInPaise: sizeBand.adjustmentInPaise,
        quantity: input.quantity,
      });
    } catch (e) {
      if (e instanceof PricingError) {
        throw new BusinessRuleError('INVALID_OPTION_SELECTION', 'Some of the chosen options are not available.', e.errors);
      }
      throw e;
    }

    const groupName = new Map(groups.map((g) => [g.code, g.name]));
    const valueById = new Map(values.map((v) => [v.id, v]));
    const selectedOptions = breakdown.lines
      .filter((l) => l.kind === 'OPTION' && l.optionValueId)
      .map((l) => {
        const value = valueById.get(l.optionValueId!)!;
        return {
          groupCode: value.groupCode,
          groupName: groupName.get(value.groupCode) ?? value.groupCode,
          valueId: value.id,
          valueName: value.name,
          surchargeInPaise: l.amountInPaise,
        };
      });

    return {
      breakdown,
      design: { id: design.id, name: design.name, slug: design.slug },
      sizeBand: { id: sizeBand.id, code: sizeBand.code, label: sizeBand.label },
      selectedOptions,
    };
  }
}
