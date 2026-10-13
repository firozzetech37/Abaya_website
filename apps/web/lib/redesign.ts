import {
  calculatePrice,
  type DesignDetail,
  type OptionGroupCode,
  type PriceBreakdown,
  type PricingOptionGroup,
  type PricingOptionValue,
} from '@abaya/contracts';

export type Selections = Partial<Record<OptionGroupCode, string[]>>;

/** Defaults from `isDefault`, one per single-select group, any number for multi-select groups. */
export function defaultSelections(design: DesignDetail): Selections {
  const out: Selections = {};
  for (const g of design.optionGroups) {
    const defaults = g.values.filter((v) => v.isDefault).map((v) => v.id);
    out[g.code] = g.selectionType === 'SINGLE' ? defaults.slice(0, 1) : defaults;
  }
  return out;
}

export const selectedIds = (design: DesignDetail, s: Selections): string[] =>
  design.optionGroups.flatMap((g) => s[g.code] ?? []);

export const missingRequiredGroups = (design: DesignDetail, s: Selections) =>
  design.optionGroups.filter((g) => g.isRequired && (s[g.code]?.length ?? 0) === 0);

/**
 * Instant local estimate with the shared calculatePrice(). The public design DTO already
 * applies per-design surcharge overrides, so every listed value is "allowed" as-is.
 * Returns null when the selection is incomplete; the server quote is authoritative.
 */
export function estimatePrice(design: DesignDetail, s: Selections, sizeAdjustmentInPaise: number): PriceBreakdown | null {
  const groups: PricingOptionGroup[] = design.optionGroups.map((g) => ({
    code: g.code,
    name: g.name,
    selectionType: g.selectionType,
    isRequired: g.isRequired,
  }));
  const values: PricingOptionValue[] = design.optionGroups.flatMap((g) =>
    g.values.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      groupCode: g.code,
      surchargeInPaise: v.surchargeInPaise,
      isActive: true,
    })),
  );
  try {
    return calculatePrice({
      basePriceInPaise: design.basePriceInPaise,
      groups,
      values,
      allowed: values.map((v) => ({ optionValueId: v.id })),
      selectedOptionValueIds: selectedIds(design, s),
      sizeBandAdjustmentInPaise: sizeAdjustmentInPaise,
    });
  } catch {
    return null;
  }
}
