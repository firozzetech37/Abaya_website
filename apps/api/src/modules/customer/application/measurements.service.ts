import { Inject, Injectable } from '@nestjs/common';
import type { MeasurementBody, MeasurementProfileDto } from '@abaya/contracts';
import { NotFoundError } from '../../../common/errors/domain-error';
import {
  assertLimit,
  assertPlausibleMeasurements,
  MAX_MEASUREMENT_PROFILES,
  type MeasurementSnapshot,
  measurementSnapshot,
} from '../domain/customer.rules';
import {
  MEASUREMENT_REPOSITORY,
  type MeasurementProfileRecord,
  type MeasurementRepository,
} from './ports/customer.repositories';

export const toMeasurementDto = ({ userId: _u, updatedAt, ...p }: MeasurementProfileRecord): MeasurementProfileDto => ({
  ...p,
  updatedAt: updatedAt.toISOString(),
});

/** Saved measurement profiles ("Me", "Mom"...). Checkout copies them into the order. */
@Injectable()
export class MeasurementsService {
  constructor(@Inject(MEASUREMENT_REPOSITORY) private readonly profiles: MeasurementRepository) {}

  async list(userId: string): Promise<MeasurementProfileDto[]> {
    return (await this.profiles.listForUser(userId)).map(toMeasurementDto);
  }

  async get(userId: string, id: string): Promise<MeasurementProfileDto> {
    return toMeasurementDto(await this.requireOwn(userId, id));
  }

  async create(userId: string, input: MeasurementBody): Promise<MeasurementProfileDto> {
    const count = await this.profiles.countForUser(userId);
    assertLimit(count, MAX_MEASUREMENT_PROFILES, 'measurement profiles');
    assertPlausibleMeasurements(input);
    // The first profile is the default.
    return toMeasurementDto(await this.profiles.create(userId, { ...input, isDefault: input.isDefault || count === 0 }));
  }

  async update(userId: string, id: string, input: Partial<MeasurementBody>): Promise<MeasurementProfileDto> {
    const existing = await this.requireOwn(userId, id);
    assertPlausibleMeasurements({
      heightCm: input.heightCm ?? existing.heightCm,
      fullLengthCm: input.fullLengthCm ?? existing.fullLengthCm,
    });
    // Orders keep their own snapshot, so editing a profile never changes an order.
    return toMeasurementDto(await this.profiles.update(userId, id, input));
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.requireOwn(userId, id);
    await this.profiles.delete(userId, id);
  }

  /** CustomerService.getMeasurementSnapshot (docs/apps/api.md). */
  async snapshot(userId: string, id: string): Promise<MeasurementSnapshot> {
    return measurementSnapshot(await this.requireOwn(userId, id));
  }

  async requireOwn(userId: string, id: string): Promise<MeasurementProfileRecord> {
    const profile = await this.profiles.findForUser(userId, id);
    if (!profile) throw new NotFoundError('Measurement profile');
    return profile;
  }
}
