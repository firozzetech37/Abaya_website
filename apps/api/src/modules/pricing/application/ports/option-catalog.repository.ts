import type { OptionGroupCode, SelectionType, SizeBandCode } from '@abaya/contracts';
import type { AuditEntry } from '../../../../common/audit/audit';

export interface OptionGroupRecord {
  id: string;
  code: OptionGroupCode;
  name: string;
  selectionType: SelectionType;
  isRequired: boolean;
  sortOrder: number;
}

export interface OptionValueRecord {
  id: string;
  groupId: string;
  groupCode: OptionGroupCode;
  code: string;
  name: string;
  description: string | null;
  surchargeInPaise: number;
  swatchImagePath: string | null;
  colourHex: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface SizeBandRecord {
  id: string;
  code: SizeBandCode;
  label: string;
  adjustmentInPaise: number;
  bustMinCm: number | null;
  bustMaxCm: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface NewOptionValue {
  groupCode: OptionGroupCode;
  code: string;
  name: string;
  description?: string;
  surchargeInPaise: number;
  colourHex?: string;
  isActive: boolean;
}

export type OptionValuePatch = Partial<Omit<NewOptionValue, 'groupCode' | 'code'>>;

export interface OptionCatalogRepository {
  listGroups(): Promise<OptionGroupRecord[]>;
  /** All values, active and inactive, ordered by group then sortOrder. */
  listValues(): Promise<OptionValueRecord[]>;
  findValuesByIds(ids: string[]): Promise<OptionValueRecord[]>;
  findValue(id: string): Promise<OptionValueRecord | null>;
  createValue(input: NewOptionValue, audit: AuditEntry): Promise<OptionValueRecord>;
  updateValue(id: string, patch: OptionValuePatch, audit: AuditEntry[]): Promise<OptionValueRecord>;

  listSizeBands(): Promise<SizeBandRecord[]>;
  findSizeBand(id: string): Promise<SizeBandRecord | null>;
  findSizeBandByCode(code: SizeBandCode): Promise<SizeBandRecord | null>;
  updateSizeBand(
    id: string,
    patch: { label?: string; adjustmentInPaise?: number; isActive?: boolean },
    audit: AuditEntry[],
  ): Promise<SizeBandRecord>;
}
export const OPTION_CATALOG_REPOSITORY = Symbol('OPTION_CATALOG_REPOSITORY');
