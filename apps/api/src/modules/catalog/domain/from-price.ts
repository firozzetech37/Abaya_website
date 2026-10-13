import type { OptionGroupCode } from '@abaya/contracts';

export interface FromPriceGroup {
  code: OptionGroupCode;
  isRequired: boolean;
}

export interface FromPriceValue {
  groupCode: OptionGroupCode;
  /** Surcharge for this design (override already applied). */
  surchargeInPaise: number;
  isDefault: boolean;
}

/**
 * The "from" price on design cards: base price + the default choice in each
 * group (or, for a required group with no default, its cheapest option).
 * Size-band adjustments are excluded because standard sizes start at +₹0.
 */
export function fromPrice(basePriceInPaise: number, groups: FromPriceGroup[], values: FromPriceValue[]): number {
  let total = basePriceInPaise;
  for (const group of groups) {
    const inGroup = values.filter((v) => v.groupCode === group.code);
    const defaults = inGroup.filter((v) => v.isDefault);
    if (defaults.length > 0) {
      total += defaults.reduce((sum, v) => sum + v.surchargeInPaise, 0);
    } else if (group.isRequired && inGroup.length > 0) {
      total += Math.min(...inGroup.map((v) => v.surchargeInPaise));
    }
  }
  return total;
}
