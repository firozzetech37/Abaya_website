import {
  calculatePrice,
  type DesignDetail,
  type OptionGroupCode,
  type PriceBreakdown,
  PricingError,
  validateSelections,
} from '@abaya/contracts';

/** What the customer chose on the Redesign sheet. Sent to the API as ids only, never prices. */
export interface RedesignSelection {
  optionValueIds: string[];
  size: { kind: 'BAND'; sizeBandId: string } | { kind: 'MEASUREMENTS'; measurementProfileId: string } | null;
}

type Group = DesignDetail['optionGroups'][number];
type SizeBand = DesignDetail['sizeBands'][number];

export function defaultOptionIds(design: DesignDetail): string[] {
  return design.optionGroups.flatMap((g) => {
    const defaults = g.values.filter((v) => v.isDefault).map((v) => v.id);
    return g.selectionType === 'SINGLE' ? defaults.slice(0, 1) : defaults;
  });
}

export function toggleOption(design: DesignDetail, selected: string[], group: Group, valueId: string): string[] {
  const groupIds = new Set(group.values.map((v) => v.id));
  const isOn = selected.includes(valueId);
  if (group.selectionType === 'MULTI') {
    return isOn ? selected.filter((id) => id !== valueId) : [...selected, valueId];
  }
  if (isOn) {
    // A required single-choice group always keeps one value.
    return group.isRequired ? selected : selected.filter((id) => id !== valueId);
  }
  const others = selected.filter((id) => !groupIds.has(id));
  // Keep the order of groups stable for display.
  const order = new Map(design.optionGroups.flatMap((g) => g.values.map((v) => v.id)).map((id, i) => [id, i]));
  return [...others, valueId].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

function pricingParts(design: DesignDetail) {
  const groups = design.optionGroups.map((g) => ({
    code: g.code,
    name: g.name,
    selectionType: g.selectionType,
    isRequired: g.isRequired,
  }));
  const values = design.optionGroups.flatMap((g) =>
    g.values.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      groupCode: g.code as OptionGroupCode,
      // Public values already include any per-design override.
      surchargeInPaise: v.surchargeInPaise,
      isActive: true,
    })),
  );
  const allowed = values.map((v) => ({ optionValueId: v.id }));
  return { groups, values, allowed };
}

export function missingRequiredGroups(design: DesignDetail, selected: string[]): OptionGroupCode[] {
  return validateSelections({ ...pricingParts(design), selectedOptionValueIds: selected }).flatMap((e) =>
    e.code === 'REQUIRED_GROUP_MISSING' ? [e.groupCode] : [],
  );
}

export function sizeAdjustment(design: DesignDetail, size: RedesignSelection['size']): number {
  if (!size) return 0;
  if (size.kind === 'MEASUREMENTS') {
    return design.sizeBands.find((b) => b.code === 'CUSTOM')?.adjustmentInPaise ?? 0;
  }
  return design.sizeBands.find((b) => b.id === size.sizeBandId)?.adjustmentInPaise ?? 0;
}

/** Instant local estimate with the shared pricing function; null when the selection is incomplete. */
export function estimatePrice(design: DesignDetail, selection: RedesignSelection): PriceBreakdown | null {
  try {
    return calculatePrice({
      basePriceInPaise: design.basePriceInPaise,
      ...pricingParts(design),
      selectedOptionValueIds: selection.optionValueIds,
      sizeBandAdjustmentInPaise: sizeAdjustment(design, selection.size),
      quantity: 1,
    });
  } catch (e) {
    if (e instanceof PricingError) return null;
    throw e;
  }
}

/** Standard bands customers can pick (CUSTOM is used automatically for measurements). */
export const standardBands = (design: DesignDetail): SizeBand[] =>
  design.sizeBands.filter((b) => b.code !== 'CUSTOM');

/** Short chip label, e.g. "M" and "88–94 cm" from "M (bust 88–94 cm)". */
export function bandParts(band: SizeBand): { code: string; range: string | null; min?: number; max?: number } {
  const m = /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*cm/.exec(band.label);
  if (!m) return { code: band.code, range: null };
  return { code: band.code, range: `${m[1]}–${m[2]} cm`, min: Number(m[1]), max: Number(m[2]) };
}

export function suggestBand(design: DesignDetail, bustCm: number): SizeBand | null {
  return (
    standardBands(design).find((b) => {
      const p = bandParts(b);
      return p.min !== undefined && p.max !== undefined && bustCm >= p.min && bustCm <= p.max + 0.99;
    }) ?? null
  );
}
