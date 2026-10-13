import { Inject, Injectable } from '@nestjs/common';
import type { AddressBody, AddressDto } from '@abaya/contracts';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import { MAX_ADDRESSES } from '../domain/user.rules';
import { ADDRESS_REPOSITORY, type AddressRecord, type AddressRepository } from './ports/identity.repositories';

const toDto = ({ userId: _userId, ...a }: AddressRecord): AddressDto => a;

@Injectable()
export class AddressesService {
  constructor(@Inject(ADDRESS_REPOSITORY) private readonly addresses: AddressRepository) {}

  async list(userId: string): Promise<AddressDto[]> {
    return (await this.addresses.listForUser(userId)).map(toDto);
  }

  async create(userId: string, input: AddressBody): Promise<AddressDto> {
    const count = await this.addresses.countForUser(userId);
    if (count >= MAX_ADDRESSES) {
      throw new BusinessRuleError('TOO_MANY_ADDRESSES', `You can save up to ${MAX_ADDRESSES} addresses.`);
    }
    // The first address is always the default.
    return toDto(await this.addresses.create(userId, { ...input, isDefault: input.isDefault || count === 0 }));
  }

  async update(userId: string, id: string, input: Partial<AddressBody>): Promise<AddressDto> {
    await this.requireOwn(userId, id);
    return toDto(await this.addresses.update(userId, id, input));
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.requireOwn(userId, id);
    await this.addresses.delete(userId, id);
  }

  private async requireOwn(userId: string, id: string): Promise<AddressRecord> {
    const address = await this.addresses.findForUser(userId, id);
    if (!address) throw new NotFoundError('Address');
    return address;
  }
}
