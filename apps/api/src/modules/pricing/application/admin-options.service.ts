import { Inject, Injectable } from '@nestjs/common';
import type { OptionGroupCode } from '@abaya/contracts';
import type { AuditEntry } from '../../../common/audit/audit';
import type { Actor } from '../../../common/auth/auth.types';
import { NotFoundError } from '../../../common/errors/domain-error';
import { OptionCatalogService } from './option-catalog.service';
import {
  type NewOptionValue,
  OPTION_CATALOG_REPOSITORY,
  type OptionCatalogRepository,
  type OptionValuePatch,
  type OptionValueRecord,
  type SizeBandRecord,
} from './ports/option-catalog.repository';

/** CATALOG_MANAGER: option values and size bands. Every surcharge change is audited. */
@Injectable()
export class AdminOptionsService {
  constructor(
    @Inject(OPTION_CATALOG_REPOSITORY) private readonly repo: OptionCatalogRepository,
    private readonly catalog: OptionCatalogService,
  ) {}

  async listGroupsWithValues() {
    const [groups, values] = await Promise.all([this.repo.listGroups(), this.repo.listValues()]);
    return groups.map((g) => ({ ...g, values: values.filter((v) => v.groupId === g.id) }));
  }

  listValues(groupCode?: OptionGroupCode): Promise<OptionValueRecord[]> {
    return this.repo.listValues().then((vs) => (groupCode ? vs.filter((v) => v.groupCode === groupCode) : vs));
  }

  async createValue(actor: Actor, input: NewOptionValue): Promise<OptionValueRecord> {
    try {
      return await this.createValueUncached(actor, input);
    } finally {
      this.catalog.invalidate();
    }
  }

  private createValueUncached(actor: Actor, input: NewOptionValue): Promise<OptionValueRecord> {
    return this.repo.createValue(input, {
      actorUserId: actor.userId,
      action: 'option.created',
      entityType: 'OptionValue',
      entityId: `${input.groupCode}:${input.code}`,
      after: input,
      ip: actor.ip,
    });
  }

  async updateValue(actor: Actor, id: string, patch: OptionValuePatch): Promise<OptionValueRecord> {
    try {
      return await this.updateValueUncached(actor, id, patch);
    } finally {
      this.catalog.invalidate();
    }
  }

  private async updateValueUncached(actor: Actor, id: string, patch: OptionValuePatch): Promise<OptionValueRecord> {
    const before = await this.repo.findValue(id);
    if (!before) throw new NotFoundError('Option value');

    const audit: AuditEntry[] = [];
    const base = { actorUserId: actor.userId, entityType: 'OptionValue', entityId: id, ip: actor.ip };
    if (patch.surchargeInPaise !== undefined && patch.surchargeInPaise !== before.surchargeInPaise) {
      audit.push({
        ...base,
        action: 'option.surcharge_changed',
        before: { surchargeInPaise: before.surchargeInPaise },
        after: { surchargeInPaise: patch.surchargeInPaise },
      });
    }
    const { surchargeInPaise: _s, ...rest } = patch;
    const changed = Object.entries(rest).filter(
      ([k, v]) => v !== undefined && v !== (before as unknown as Record<string, unknown>)[k],
    );
    if (changed.length > 0) {
      audit.push({
        ...base,
        action: 'option.updated',
        before: Object.fromEntries(changed.map(([k]) => [k, (before as unknown as Record<string, unknown>)[k]])),
        after: Object.fromEntries(changed),
      });
    }
    return this.repo.updateValue(id, patch, audit);
  }

  listSizeBands(): Promise<SizeBandRecord[]> {
    return this.repo.listSizeBands();
  }

  async updateSizeBand(
    actor: Actor,
    id: string,
    patch: { label?: string; adjustmentInPaise?: number; isActive?: boolean },
  ): Promise<SizeBandRecord> {
    try {
      return await this.updateSizeBandUncached(actor, id, patch);
    } finally {
      this.catalog.invalidate();
    }
  }

  private async updateSizeBandUncached(
    actor: Actor,
    id: string,
    patch: { label?: string; adjustmentInPaise?: number; isActive?: boolean },
  ): Promise<SizeBandRecord> {
    const before = await this.repo.findSizeBand(id);
    if (!before) throw new NotFoundError('Size band');
    const audit: AuditEntry[] = [];
    if (patch.adjustmentInPaise !== undefined && patch.adjustmentInPaise !== before.adjustmentInPaise) {
      audit.push({
        actorUserId: actor.userId,
        action: 'size_band.adjustment_changed',
        entityType: 'SizeBand',
        entityId: id,
        before: { adjustmentInPaise: before.adjustmentInPaise },
        after: { adjustmentInPaise: patch.adjustmentInPaise },
        ip: actor.ip,
      });
    }
    return this.repo.updateSizeBand(id, patch, audit);
  }
}
