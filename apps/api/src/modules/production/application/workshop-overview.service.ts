import { Inject, Injectable } from '@nestjs/common';
import {
  missingTeam,
  type OverviewJobDto,
  type OverviewJobState,
  type OverviewPersonDto,
  type ProductionStage,
  TEAM_SLOTS,
  type TeamSlot,
  WORKSHOP_STATIONS,
  type WorkshopOverviewDto,
} from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { ForbiddenError } from '../../../common/errors/domain-error';
import { IdentityService } from '../../identity/application/identity.service';
import { OrdersService } from '../../orders/application/orders.service';
import { type ItemWithOrder, ORDER_MEDIA, type OrderMedia } from '../../orders/application/ports/orders.ports';
import { isOverdue, stationOfItem } from '../domain/workshop.rules';
import { MakersService } from './makers.service';
import { TeamService } from './team.service';

/** Paid items still in production (logistics' PACKED included for the attention lists). */
const ACTIVE: ProductionStage[] = ['PLACED', 'SPEC_APPROVED', 'PATTERN', 'CUTTING', 'STITCHING', 'QC', 'FINISHING', 'PACKED', 'REMAKE', 'ON_HOLD'];

const isManager = (actor: Actor) => actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('PRODUCTION_MANAGER');

/** Where a job is on the line: the index of its station (-1 before pattern: PLACED, REMAKE). */
const lineIndex = (item: Pick<ItemWithOrder, 'stage' | 'heldFromStage'>): number => {
  const station = stationOfItem(item.stage, item.heldFromStage);
  return station ? WORKSHOP_STATIONS.indexOf(station) : -1;
};

/**
 * The production manager's view of the workshop (docs/apps/workshop.md "Team at work"): each
 * person with the jobs they are on, waiting for, or will get next; who is idle; and what
 * needs attention (on hold, overdue, team not assigned).
 */
@Injectable()
export class WorkshopOverviewService {
  constructor(
    @Inject(ORDER_MEDIA) private readonly media: OrderMedia,
    private readonly orders: OrdersService,
    private readonly identity: IdentityService,
    private readonly makers: MakersService,
    private readonly team: TeamService,
  ) {}

  async overview(actor: Actor): Promise<WorkshopOverviewDto> {
    if (!isManager(actor)) throw new ForbiddenError('Only production managers see the whole workshop.');
    const now = new Date();
    const items = await this.orders.listForWorkshop(ACTIVE, { limit: 500 });
    const [teams, options] = await Promise.all([this.team.byItem(items.map((i) => i.id)), this.team.options()]);
    const contacts = await this.identity.getContacts(items.flatMap((i) => (i.claimedById ? [i.claimedById] : [])));
    const makerNames = await this.makers.namesById(items.flatMap((i) => (i.makerId ? [i.makerId] : [])));

    const job = (i: ItemWithOrder): OverviewJobDto => ({
      id: i.id,
      orderId: i.orderId,
      orderNumber: i.order.orderNumber,
      designName: i.designSnapshot.name,
      primaryImageUrl: this.media.designImageUrl(i.designSnapshot.primaryImagePath),
      stage: i.stage,
      station: stationOfItem(i.stage, i.heldFromStage),
      heldFromStage: i.heldFromStage,
      holdReason: i.holdReason,
      dueDate: i.dueDate?.toISOString() ?? null,
      isOverdue: isOverdue(i.dueDate, now),
      isRework: i.stageEvents.some((e) => e.fromStage === 'QC' && e.toStage !== 'FINISHING') || i.stageEvents.some((e) => e.toStage === 'REMAKE'),
      startedBy: i.claimedById ? { id: i.claimedById, name: contacts.get(i.claimedById)?.name ?? contacts.get(i.claimedById)?.email ?? null } : null,
      startedAt: i.claimedAt?.toISOString() ?? null,
    });

    // Every person on a team slot, with their jobs from where the item is now onwards.
    const people = new Map<string, OverviewPersonDto>();
    const nameOf = (slot: TeamSlot, id: string) => options[slot].find((o) => o.id === id)?.name ?? (slot === 'stitching' ? (makerNames.get(id)?.name ?? null) : null);
    for (const item of items) {
      const here = lineIndex(item);
      const team = teams.get(item.id) ?? {};
      TEAM_SLOTS.forEach((slot) => {
        const personId = slot === 'stitching' ? item.makerId : team[slot];
        const slotIndex = WORKSHOP_STATIONS.indexOf(slot);
        if (!personId || slotIndex < here) return; // done at that station already
        const state: OverviewJobState =
          slotIndex > here ? 'upcoming' : item.stage === 'ON_HOLD' ? 'held' : item.claimedById ? 'started' : 'waiting';
        const key = `${slot}:${personId}`;
        const person = people.get(key) ?? {
          id: personId,
          kind: slot === 'stitching' ? ('tailor' as const) : ('staff' as const),
          name: nameOf(slot, personId),
          station: slot,
          jobs: [],
        };
        person.jobs.push({ ...job(item), state });
        people.set(key, person);
      });
    }

    const ORDER: Record<OverviewJobState, number> = { started: 0, held: 1, waiting: 2, upcoming: 3 };
    const sorted = [...people.values()]
      .map((p) => ({
        ...p,
        jobs: p.jobs.sort((a, b) => ORDER[a.state] - ORDER[b.state] || Number(b.isOverdue) - Number(a.isOverdue)),
      }))
      .sort(
        (a, b) =>
          b.jobs.filter((j) => j.isOverdue).length - a.jobs.filter((j) => j.isOverdue).length ||
          b.jobs.filter((j) => j.state !== 'upcoming').length - a.jobs.filter((j) => j.state !== 'upcoming').length ||
          TEAM_SLOTS.indexOf(a.station) - TEAM_SLOTS.indexOf(b.station),
      );

    const idle = TEAM_SLOTS.flatMap((slot) =>
      options[slot]
        .filter((o) => !people.has(`${slot}:${o.id}`))
        .map((o) => ({ id: o.id, kind: slot === 'stitching' ? ('tailor' as const) : ('staff' as const), name: o.name, station: slot })),
    );

    const inProduction = items.filter((i) => i.stage !== 'PACKED');
    return {
      people: sorted,
      idle,
      onHold: items.filter((i) => i.stage === 'ON_HOLD').map(job),
      overdue: inProduction.filter((i) => isOverdue(i.dueDate, now)).map(job),
      teamMissing: inProduction
        .map((i) => ({ i, missing: missingTeam({ ...teams.get(i.id), makerId: i.makerId }) }))
        .filter((x) => x.missing.length > 0)
        .slice(0, 50)
        .map((x) => ({ ...job(x.i), missing: x.missing })),
      inProgress: items.filter((i) => i.claimedById !== null && stationOfItem(i.stage, i.heldFromStage) !== null && i.stage !== 'ON_HOLD').length,
    };
  }
}
