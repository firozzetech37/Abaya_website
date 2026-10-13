/**
 * The ONE pricing implementation used by web, mobile, admin and the API.
 * Pure functions, no dependencies. All money is integer paise.
 * Rules: docs/domain-model.md §3.
 */
import type { OptionGroupCode, SelectionType } from './enums';

export interface PricingOptionValue {
  id: string;
  code: string;
  name: string;
  groupCode: OptionGroupCode;
  surchargeInPaise: number;
  isActive: boolean;
}

export interface PricingOptionGroup {
  code: OptionGroupCode;
  name: string;
  selectionType: SelectionType;
  isRequired: boolean;
}

/** One value a design allows, with an optional per-design surcharge override. */
export interface DesignAllowedOption {
  optionValueId: string;
  surchargeOverrideInPaise?: number | null;
}

export interface PriceInput {
  basePriceInPaise: number;
  groups: PricingOptionGroup[];
  values: PricingOptionValue[];
  allowed: DesignAllowedOption[];
  selectedOptionValueIds: string[];
  sizeBandAdjustmentInPaise: number;
  quantity?: number;
}

export interface PriceLine {
  kind: 'BASE' | 'OPTION' | 'SIZE';
  label: string;
  groupCode?: OptionGroupCode;
  optionValueId?: string;
  amountInPaise: number;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  unitPriceInPaise: number;
  quantity: number;
  totalInPaise: number;
}

export type SelectionError =
  | { code: 'UNKNOWN_OPTION'; optionValueId: string }
  | { code: 'OPTION_NOT_ALLOWED'; optionValueId: string }
  | { code: 'OPTION_INACTIVE'; optionValueId: string }
  | { code: 'DUPLICATE_OPTION'; optionValueId: string }
  | { code: 'REQUIRED_GROUP_MISSING'; groupCode: OptionGroupCode }
  | { code: 'TOO_MANY_FOR_SINGLE_GROUP'; groupCode: OptionGroupCode };

export class PricingError extends Error {
  constructor(
    message: string,
    public readonly errors: SelectionError[] = [],
  ) {
    super(message);
    this.name = 'PricingError';
  }
}

function assertPaise(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new PricingError(`${name} must be a non-negative integer number of paise`);
  }
}

/** Returns every problem with a selection; an empty array means it is valid. */
export function validateSelections(
  input: Pick<PriceInput, 'groups' | 'values' | 'allowed' | 'selectedOptionValueIds'>,
): SelectionError[] {
  const errors: SelectionError[] = [];
  const valuesById = new Map(input.values.map((v) => [v.id, v]));
  const allowedIds = new Set(input.allowed.map((a) => a.optionValueId));
  const seen = new Set<string>();
  const countByGroup = new Map<OptionGroupCode, number>();

  for (const id of input.selectedOptionValueIds) {
    if (seen.has(id)) {
      errors.push({ code: 'DUPLICATE_OPTION', optionValueId: id });
      continue;
    }
    seen.add(id);

    const value = valuesById.get(id);
    if (!value) {
      errors.push({ code: 'UNKNOWN_OPTION', optionValueId: id });
      continue;
    }
    if (!allowedIds.has(id)) {
      errors.push({ code: 'OPTION_NOT_ALLOWED', optionValueId: id });
      continue;
    }
    if (!value.isActive) {
      errors.push({ code: 'OPTION_INACTIVE', optionValueId: id });
      continue;
    }
    countByGroup.set(value.groupCode, (countByGroup.get(value.groupCode) ?? 0) + 1);
  }

  for (const group of input.groups) {
    const count = countByGroup.get(group.code) ?? 0;
    if (group.isRequired && count === 0) {
      errors.push({ code: 'REQUIRED_GROUP_MISSING', groupCode: group.code });
    }
    if (group.selectionType === 'SINGLE' && count > 1) {
      errors.push({ code: 'TOO_MANY_FOR_SINGLE_GROUP', groupCode: group.code });
    }
  }

  return errors;
}

/**
 * unitPrice = base + Σ selected surcharges (design override wins) + size-band adjustment
 * total     = unitPrice × quantity
 * Throws PricingError when the selection is invalid.
 */
export function calculatePrice(input: PriceInput): PriceBreakdown {
  const quantity = input.quantity ?? 1;
  assertPaise('basePriceInPaise', input.basePriceInPaise);
  assertPaise('sizeBandAdjustmentInPaise', input.sizeBandAdjustmentInPaise);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new PricingError('quantity must be an integer between 1 and 10');
  }

  const errors = validateSelections(input);
  if (errors.length > 0) {
    throw new PricingError('Invalid option selection', errors);
  }

  const valuesById = new Map(input.values.map((v) => [v.id, v]));
  const overrideById = new Map(
    input.allowed.map((a) => [a.optionValueId, a.surchargeOverrideInPaise ?? null]),
  );
  const groupOrder = new Map(input.groups.map((g, i) => [g.code, i]));

  const lines: PriceLine[] = [
    { kind: 'BASE', label: 'Base price', amountInPaise: input.basePriceInPaise },
  ];

  const selected = input.selectedOptionValueIds
    .map((id) => valuesById.get(id)!)
    .sort(
      (a, b) =>
        (groupOrder.get(a.groupCode) ?? 99) - (groupOrder.get(b.groupCode) ?? 99) ||
        a.name.localeCompare(b.name),
    );

  for (const value of selected) {
    const override = overrideById.get(value.id);
    const amount = override ?? value.surchargeInPaise;
    assertPaise(`surcharge for ${value.code}`, amount);
    lines.push({
      kind: 'OPTION',
      label: value.name,
      groupCode: value.groupCode,
      optionValueId: value.id,
      amountInPaise: amount,
    });
  }

  if (input.sizeBandAdjustmentInPaise > 0) {
    lines.push({ kind: 'SIZE', label: 'Size', amountInPaise: input.sizeBandAdjustmentInPaise });
  }

  const unitPriceInPaise = lines.reduce((sum, l) => sum + l.amountInPaise, 0);
  return { lines, unitPriceInPaise, quantity, totalInPaise: unitPriceInPaise * quantity };
}

/** ₹2,499 or ₹2,499.50 — Indian digit grouping. */
/**
 * Currencies the website can display. Everything is priced, quoted, stored and charged in INR;
 * AED (UAE dirham) and SAR (Saudi riyal) are display conversions.
 */
export const CURRENCIES = ['INR', 'AED', 'SAR'] as const;
export type Currency = (typeof CURRENCIES)[number];
/** The converted display currencies (everything except the rupee). */
export type DisplayCurrency = Exclude<Currency, 'INR'>;
export const DISPLAY_CURRENCIES = ['AED', 'SAR'] as const satisfies readonly DisplayCurrency[];

/** GET /v1/pricing/rates: how many units of each display currency one rupee buys. */
export interface FxRatesDto {
  base: 'INR';
  rates: Record<DisplayCurrency, number>;
  /** When the live rate was fetched; the configured fallback when the feed was unreachable. */
  fetchedAt: string;
  source: 'live' | 'fallback';
}

/** Whole dirhams (or riyals) for an amount in paise at `perInr` (display only; the charge is always in INR). */
export const toAed = (paise: number, perInr: number): number => Math.round((paise / 100) * perInr);
export const toDisplayAmount = toAed;

/**
 * A price for display: rupees as stored, or dirhams / riyals converted at `rate` (units per rupee)
 * and rounded to the whole unit. `locale` 'ar' writes "د.إ" / "ر.س" with Western digits, 'en'
 * writes "AED" / "SAR".
 */
export function formatMoney(paise: number, opts: { currency: Currency; rate?: number | null; locale?: 'en' | 'ar' }): string {
  if (opts.currency === 'INR' || !opts.rate) return formatINR(paise);
  const region = opts.currency === 'SAR' ? 'SA' : 'AE';
  return new Intl.NumberFormat(opts.locale === 'ar' ? `ar-${region}-u-nu-latn` : `en-${region}`, {
    style: 'currency',
    currency: opts.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toAed(paise, opts.rate));
}

export function formatINR(paise: number): string {
  const hasFraction = paise % 100 !== 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);
