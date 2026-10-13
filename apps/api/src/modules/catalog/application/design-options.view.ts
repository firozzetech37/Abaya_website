import type { OptionCatalog } from '../../pricing/application/option-catalog.service';
import type { OptionValueRecord } from '../../pricing/application/ports/option-catalog.repository';
import type { DesignRecord } from './ports/catalog.ports';

export interface AllowedValueView {
  value: OptionValueRecord;
  surchargeInPaise: number;
  surchargeOverrideInPaise: number | null;
  isDefault: boolean;
}

/** Active option values a design allows, with its per-design surcharge applied, in display order. */
export function allowedActiveValues(design: Pick<DesignRecord, 'options'>, catalog: OptionCatalog): AllowedValueView[] {
  const byId = new Map(catalog.values.map((v) => [v.id, v]));
  const groupOrder = new Map(catalog.groups.map((g) => [g.code, g.sortOrder]));
  return design.options
    .map((o) => {
      const value = byId.get(o.optionValueId);
      if (!value || !value.isActive) return null;
      return {
        value,
        surchargeInPaise: o.surchargeOverrideInPaise ?? value.surchargeInPaise,
        surchargeOverrideInPaise: o.surchargeOverrideInPaise,
        isDefault: o.isDefault,
      };
    })
    .filter((v): v is AllowedValueView => v !== null)
    .sort(
      (a, b) =>
        (groupOrder.get(a.value.groupCode) ?? 99) - (groupOrder.get(b.value.groupCode) ?? 99) ||
        a.value.sortOrder - b.value.sortOrder,
    );
}

/** Required groups with no active allowed value (blocks PRICED/PUBLISHED). */
export function requiredGroupsWithoutOptions(design: Pick<DesignRecord, 'options'>, catalog: OptionCatalog): string[] {
  const allowed = allowedActiveValues(design, catalog);
  return catalog.groups
    .filter((g) => g.isRequired && !allowed.some((a) => a.value.groupCode === g.code))
    .map((g) => g.name);
}
