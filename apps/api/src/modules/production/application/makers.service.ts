import { Inject, Injectable } from '@nestjs/common';
import type { MakerDto } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import type { TailorAddedEvent } from '../../../common/events/events';
import { NotFoundError } from '../../../common/errors/domain-error';
import { IdentityService } from '../../identity/application/identity.service';
import { OrdersService } from '../../orders/application/orders.service';
import {
  type MakerInput,
  type MakerRecord,
  type PayoutRecord,
  PRODUCTION_REPOSITORY,
  type ProductionRepository,
} from './ports/production.ports';

/** Tailors (added in Staff & roles), their load and payouts (PRODUCTION_MANAGER). */
@Injectable()
export class MakersService {
  constructor(
    @Inject(PRODUCTION_REPOSITORY) private readonly repo: ProductionRepository,
    private readonly orders: OrdersService,
    private readonly identity: IdentityService,
  ) {}

  /**
   * Staff & roles added a tailor (TailorAdded): create their tailor record, or refresh the
   * details of the one with this email. The login is linked on their first workshop visit.
   */
  async ensureTailor(e: TailorAddedEvent): Promise<MakerRecord> {
    const existing = await this.repo.findMakerByEmail(e.email);
    const audit = { actorUserId: e.actorUserId, entityType: 'Maker', ip: e.ip };
    if (existing) {
      const input = { city: e.city, isActive: true, ...(e.name ? { name: e.name } : {}) };
      return this.repo.updateMaker(existing.id, input, {
        ...audit,
        action: 'maker.updated',
        entityId: existing.id,
        before: { city: existing.city, isActive: existing.isActive, name: existing.name },
        after: input,
      });
    }
    const name = e.name ?? e.email.split('@')[0]!;
    return this.repo.createMaker(
      { name, phone: null, city: e.city, email: e.email, skills: [], capacityPerWeek: 10, isActive: true },
      { ...audit, action: 'maker.created', entityId: '', after: { name, city: e.city, email: e.email } },
    );
  }

  /**
   * The caller's own active tailor record. On a tailor's first visit their login is linked to
   * the record Staff & roles created for their email.
   */
  async ownMakerId(actor: Actor): Promise<string | null> {
    if (!actor.roles.includes('MAKER')) return null;
    const linked = await this.repo.findMakerByUserId(actor.userId);
    if (linked) return linked.isActive ? linked.id : null;
    const email = (await this.identity.getContact(actor.userId))?.email;
    const [maker] = email ? await this.repo.findUnlinkedMakers({ email }) : [];
    if (!maker) return null;
    await this.repo.setMakerUser(maker.id, actor.userId, {
      actorUserId: actor.userId,
      action: 'maker.updated',
      entityType: 'Maker',
      entityId: maker.id,
      before: { userId: null },
      after: { userId: actor.userId, linkedBy: 'email' },
      ip: actor.ip,
    });
    return maker.id;
  }

  private async getDto(makerId: string): Promise<MakerDto> {
    const [maker, active, pending] = await Promise.all([
      this.repo.findMaker(makerId),
      this.orders.countActiveByMaker(),
      this.repo.pendingPayoutTotals(),
    ]);
    if (!maker) throw new NotFoundError('Maker');
    return this.toDto(maker, active.get(makerId) ?? 0, pending.get(makerId) ?? 0);
  }

  async list(): Promise<MakerDto[]> {
    const [makers, active, pending] = await Promise.all([
      this.repo.listMakers(),
      this.orders.countActiveByMaker(),
      this.repo.pendingPayoutTotals(),
    ]);
    return makers.map((m) => this.toDto(m, active.get(m.id) ?? 0, pending.get(m.id) ?? 0));
  }

  async update(actor: Actor, id: string, input: MakerInput): Promise<MakerDto> {
    const before = await this.repo.findMaker(id);
    if (!before) throw new NotFoundError('Maker');
    const maker = await this.repo.updateMaker(id, input, {
      actorUserId: actor.userId,
      action: 'maker.updated',
      entityType: 'Maker',
      entityId: id,
      before: Object.fromEntries(Object.keys(input).map((k) => [k, (before as unknown as Record<string, unknown>)[k]])),
      after: input,
      ip: actor.ip,
    });
    const [active, pending] = await Promise.all([this.orders.countActiveByMaker(), this.repo.pendingPayoutTotals()]);
    return this.toDto(maker, active.get(id) ?? 0, pending.get(id) ?? 0);
  }

  async payouts(makerId: string): Promise<PayoutRecord[]> {
    if (!(await this.repo.findMaker(makerId))) throw new NotFoundError('Maker');
    return this.repo.listPayouts(makerId);
  }

  async markPayoutPaid(actor: Actor, makerId: string, payoutId: string, reference: string): Promise<PayoutRecord> {
    const payout = await this.repo.markPayoutPaid(makerId, payoutId, reference, {
      actorUserId: actor.userId,
      action: 'maker.payout_marked_paid',
      entityType: 'MakerPayout',
      entityId: payoutId,
      after: { reference },
      ip: actor.ip,
    });
    if (!payout) throw new NotFoundError('Pending payout');
    return payout;
  }

  async namesById(ids: string[]): Promise<Map<string, MakerRecord>> {
    return new Map((await this.repo.findMakers(Array.from(new Set(ids)))).map((m) => [m.id, m]));
  }

  private toDto(m: MakerRecord, activeItemCount: number, pendingPayoutInPaise: number): MakerDto {
    return {
      id: m.id,
      name: m.name,
      phone: m.phone,
      email: m.email,
      city: m.city,
      skills: m.skills,
      capacityPerWeek: m.capacityPerWeek,
      rating: m.rating,
      isActive: m.isActive,
      activeItemCount,
      pendingPayoutInPaise,
      hasLogin: Boolean(m.userId),
    };
  }
}
