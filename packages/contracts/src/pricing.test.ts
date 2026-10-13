import { describe, expect, it } from 'vitest';
import {
  calculatePrice,
  formatINR,
  PricingError,
  validateSelections,
  type PriceInput,
  type PricingOptionGroup,
  type PricingOptionValue,
} from './pricing';
import { formatMoney, toAed } from './pricing';

const groups: PricingOptionGroup[] = [
  { code: 'FABRIC', name: 'Fabric', selectionType: 'SINGLE', isRequired: true },
  { code: 'COLOUR', name: 'Colour', selectionType: 'SINGLE', isRequired: true },
  { code: 'EMBELLISHMENT', name: 'Embellishment', selectionType: 'MULTI', isRequired: false },
];

const values: PricingOptionValue[] = [
  { id: 'nida', code: 'nida', name: 'Nida', groupCode: 'FABRIC', surchargeInPaise: 0, isActive: true },
  { id: 'satin', code: 'satin', name: 'Satin', groupCode: 'FABRIC', surchargeInPaise: 60000, isActive: true },
  { id: 'black', code: 'black', name: 'Black', groupCode: 'COLOUR', surchargeInPaise: 0, isActive: true },
  { id: 'lace', code: 'lace', name: 'Front lace', groupCode: 'EMBELLISHMENT', surchargeInPaise: 60000, isActive: true },
  { id: 'stones', code: 'stones', name: 'Back stonework', groupCode: 'EMBELLISHMENT', surchargeInPaise: 90000, isActive: true },
  { id: 'old', code: 'old', name: 'Retired fabric', groupCode: 'FABRIC', surchargeInPaise: 0, isActive: false },
];

const base = (overrides: Partial<PriceInput> = {}): PriceInput => ({
  basePriceInPaise: 249900,
  groups,
  values,
  allowed: values.map((v) => ({ optionValueId: v.id })),
  selectedOptionValueIds: ['nida', 'black'],
  sizeBandAdjustmentInPaise: 0,
  ...overrides,
});

describe('calculatePrice', () => {
  it('returns the base price for free default options', () => {
    const result = calculatePrice(base());
    expect(result.unitPriceInPaise).toBe(249900);
    expect(result.totalInPaise).toBe(249900);
    expect(result.lines.map((l) => l.kind)).toEqual(['BASE', 'OPTION', 'OPTION']);
  });

  it('adds surcharges, multi-select embellishments and the size adjustment', () => {
    const result = calculatePrice(
      base({
        selectedOptionValueIds: ['satin', 'black', 'lace', 'stones'],
        sizeBandAdjustmentInPaise: 30000,
      }),
    );
    // 2499 + 600 + 0 + 600 + 900 + 300 = 4899 rupees
    expect(result.unitPriceInPaise).toBe(489900);
    expect(result.lines.at(-1)).toMatchObject({ kind: 'SIZE', amountInPaise: 30000 });
  });

  it('uses the per-design surcharge override when present', () => {
    const allowed = values.map((v) =>
      v.id === 'satin' ? { optionValueId: v.id, surchargeOverrideInPaise: 40000 } : { optionValueId: v.id },
    );
    const result = calculatePrice(base({ allowed, selectedOptionValueIds: ['satin', 'black'] }));
    expect(result.unitPriceInPaise).toBe(289900);
  });

  it('treats an override of 0 as free, not as "no override"', () => {
    const allowed = values.map((v) =>
      v.id === 'satin' ? { optionValueId: v.id, surchargeOverrideInPaise: 0 } : { optionValueId: v.id },
    );
    const result = calculatePrice(base({ allowed, selectedOptionValueIds: ['satin', 'black'] }));
    expect(result.unitPriceInPaise).toBe(249900);
  });

  it('multiplies by quantity', () => {
    const result = calculatePrice(base({ quantity: 3 }));
    expect(result.totalInPaise).toBe(749700);
  });

  it('orders option lines by group order, not by selection order', () => {
    const result = calculatePrice(base({ selectedOptionValueIds: ['lace', 'black', 'nida'] }));
    expect(result.lines.map((l) => l.label)).toEqual(['Base price', 'Nida', 'Black', 'Front lace']);
  });

  it('rejects a missing required group', () => {
    expect(() => calculatePrice(base({ selectedOptionValueIds: ['nida'] }))).toThrow(PricingError);
  });

  it('rejects non-integer or negative money and bad quantities', () => {
    expect(() => calculatePrice(base({ basePriceInPaise: 2499.5 }))).toThrow(PricingError);
    expect(() => calculatePrice(base({ sizeBandAdjustmentInPaise: -1 }))).toThrow(PricingError);
    expect(() => calculatePrice(base({ quantity: 0 }))).toThrow(PricingError);
    expect(() => calculatePrice(base({ quantity: 11 }))).toThrow(PricingError);
  });
});

describe('validateSelections', () => {
  it('accepts a valid selection', () => {
    expect(validateSelections(base())).toEqual([]);
  });

  it('flags two values in a single-select group', () => {
    const errors = validateSelections(base({ selectedOptionValueIds: ['nida', 'satin', 'black'] }));
    expect(errors).toContainEqual({ code: 'TOO_MANY_FOR_SINGLE_GROUP', groupCode: 'FABRIC' });
  });

  it('flags unknown, not-allowed, inactive and duplicate values', () => {
    const allowed = values.filter((v) => v.id !== 'lace').map((v) => ({ optionValueId: v.id }));
    const errors = validateSelections(
      base({ allowed, selectedOptionValueIds: ['nida', 'black', 'ghost', 'lace', 'old', 'black'] }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        { code: 'UNKNOWN_OPTION', optionValueId: 'ghost' },
        { code: 'OPTION_NOT_ALLOWED', optionValueId: 'lace' },
        { code: 'OPTION_INACTIVE', optionValueId: 'old' },
        { code: 'DUPLICATE_OPTION', optionValueId: 'black' },
      ]),
    );
  });
});

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(249900)).toBe('₹2,499');
    expect(formatINR(12345600)).toBe('₹1,23,456');
    expect(formatINR(249950)).toBe('₹2,499.50');
  });
});

describe('display currency', () => {
  it('converts paise to whole dirhams and keeps rupees untouched', () => {
    expect(toAed(400000, 0.038)).toBe(152);
    expect(formatMoney(400000, { currency: 'INR', rate: 0.038 })).toBe('₹4,000');
    expect(formatMoney(400000, { currency: 'AED', rate: 0.038, locale: 'en' })).toMatch(/AED\s?152/);
    expect(formatMoney(400000, { currency: 'AED', rate: 0.038, locale: 'ar' })).toMatch(/152/);
    // No rate yet: never show a wrong number, fall back to rupees.
    expect(formatMoney(400000, { currency: 'AED', rate: null })).toBe('₹4,000');
    // Saudi riyals: "SAR 148" in English, "ر.س" in Arabic, with Western digits.
    expect(formatMoney(400000, { currency: 'SAR', rate: 0.037, locale: 'en' })).toMatch(/SAR\s?148/);
    expect(formatMoney(400000, { currency: 'SAR', rate: 0.037, locale: 'ar' })).toMatch(/148/);
    expect(formatMoney(400000, { currency: 'SAR', rate: 0.037, locale: 'ar' })).toMatch(/ر\.س/);
  });
});
