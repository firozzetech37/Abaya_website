import { Inject, Injectable } from '@nestjs/common';
import {
  isTeamStation,
  type ItemTeamDto,
  missingTeam,
  type ProductionStage,
  TEAM_STATION_ROLE,
  TEAM_STATIONS,
  type TeamBody,
  type TeamOptionDto,
  type TeamOptionsDto,
  type TeamStation,
  WORKSHOP_STATIONS,
} from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import { IdentityService } from '../../identity/application/identity.service';
import { OrdersService } from '../../orders/application/orders.service';
import { assertAssignable } from '../domain/production.rules';
import { stationOfItem } from '../domain/workshop.rules';
import { MakersService } from './makers.service';
import { PRODUCTION_REPOSITORY, type ProductionRepository } from './ports/production.ports';

export type ItemTeam = Partial<Record<TeamStation, string>>;

/** Finished items: the team no longer changes. */
const CLOSED: ProductionStage[] = ['SHIPPED', 'DELIVERED', 'CANCELLED'];

const stationIndex = (stage: ProductionStage, heldFrom: ProductionStage | null): number => {
  const station = stationOfItem(stage, heldFrom);
  return station ? WORKSHOP_STATIONS.indexOf(station) : -1; // PLACED, REMAKE: before every station
};

/**
 * The workshop team of each abaya (docs/apps/workshop.md "Team"): one person per station,
 * picked by the production manager before the tech pack is approved. The job then goes
 * straight to that person at each station; the tailor is the item's maker.
 */
@Injectable()
export class TeamService {
  constructor(
    @Inject(PRODUCTION_REPOSITORY) private readonly repo: ProductionRepository,
    private readonly orders: OrdersService,
    private readonly identity: IdentityService,
    private readonly makers: MakersService,
  ) {}

  async byItem(itemIds: string[]): Promise<Map<string, ItemTeam>> {
    const out = new Map<string, ItemTeam>();
    for (const a of await this.repo.listAssignments(itemIds)) {
      if (!(TEAM_STATIONS as readonly string[]).includes(a.station)) continue;
      out.set(a.orderItemId, { ...out.get(a.orderItemId), [a.station]: a.userId });
    }
    return out;
  }

  /** The person assigned to the item's current station (null: nobody, or not a team station). */
  assigneeAt(item: { stage: ProductionStage; heldFromStage: ProductionStage | null }, team: ItemTeam | undefined): string | null {
    const station = stationOfItem(item.stage, item.heldFromStage);
    return isTeamStation(station) ? (team?.[station] ?? null) : null;
  }

  /** Names for each station, the tailor included. */
  async dtos(items: { id: string; makerId: string | null }[]): Promise<Map<string, ItemTeamDto>> {
    const teams = await this.byItem(items.map((i) => i.id));
    const [people, makers] = await Promise.all([
      this.identity.getContacts([...teams.values()].flatMap((t) => Object.values(t))),
      this.makers.namesById(items.flatMap((i) => (i.makerId ? [i.makerId] : []))),
    ]);
    // Staff without a name yet show their email (internal screens only).
    const member = (id: string | undefined) => (id ? { id, name: people.get(id)?.name ?? people.get(id)?.email ?? null } : null);
    return new Map(
      items.map((i) => {
        const t = teams.get(i.id) ?? {};
        return [
          i.id,
          {
            pattern: member(t.pattern),
            cutting: member(t.cutting),
            stitching: i.makerId ? { id: i.makerId, name: makers.get(i.makerId)?.name ?? null } : null,
            qc: member(t.qc),
            finishing: member(t.finishing),
          },
        ];
      }),
    );
  }

  /** Approving the tech pack starts production: every station needs its person first. */
  async assertComplete(item: { id: string; makerId: string | null }): Promise<void> {
    const team = (await this.byItem([item.id])).get(item.id) ?? {};
    const missing = missingTeam({ ...team, makerId: item.makerId });
    if (missing.length > 0) {
      throw new BusinessRuleError('TEAM_INCOMPLETE', `Assign the team first: ${missing.join(', ')}.`, { missing });
    }
  }

  /**
   * Set the whole team. Each person must hold the station's role. When the person at the
   * item's current station changes, a job the old person had started goes back unstarted.
   */
  async setTeam(actor: Actor, itemId: string, body: TeamBody): Promise<ItemTeamDto> {
    const item = await this.orders.getItem(itemId);
    if (item.order.status !== 'PAID') throw new BusinessRuleError('ORDER_NOT_PAID', 'Production can only change on a paid order.');
    if (CLOSED.includes(item.stage)) throw new BusinessRuleError('TEAM_LOCKED', 'This abaya has left the workshop.');

    for (const station of TEAM_STATIONS) {
      const userId = body[station];
      if (userId && !(await this.identity.hasRole(userId, TEAM_STATION_ROLE[station]))) {
        throw new BusinessRuleError('NOT_A_STATION_MEMBER', `That person does not work at the ${station} station.`, { station });
      }
    }
    const before = (await this.byItem([itemId])).get(itemId) ?? {};
    const changes = TEAM_STATIONS.filter((s) => (before[s] ?? null) !== body[s]).map((s) => ({ station: s, userId: body[s] }));
    if (changes.length > 0) {
      await this.repo.setAssignments(itemId, changes, actor.userId, {
        actorUserId: actor.userId,
        action: 'workshop.team_assigned',
        entityType: 'OrderItem',
        entityId: itemId,
        before: Object.fromEntries(changes.map((c) => [c.station, before[c.station] ?? null])),
        after: Object.fromEntries(changes.map((c) => [c.station, c.userId])),
        ip: actor.ip,
      });
    }

    const current = stationOfItem(item.stage, item.heldFromStage);
    const handOver = changes.some((c) => c.station === current);

    // The tailor: picked (or changed) with a due date, like "Assign tailor".
    const newDue = body.dueDate?.toISOString().slice(0, 10) ?? null;
    const tailorChanged = body.makerId !== null && (body.makerId !== item.makerId || newDue !== (item.dueDate?.toISOString().slice(0, 10) ?? null));
    if (tailorChanged) {
      const maker = await this.repo.findMaker(body.makerId!);
      if (!maker) throw new NotFoundError('Maker');
      assertAssignable({ stage: item.stage, makerActive: maker.isActive, dueDate: body.dueDate! });
      await this.orders.assignMaker(itemId, maker.id, body.dueDate!, actor, `Assigned to ${maker.name}, due ${newDue}`);
    }
    const tailorSwapped = body.makerId !== null && body.makerId !== item.makerId && current === 'stitching';
    if ((handOver || tailorSwapped) && item.claimedById && item.stage !== 'ON_HOLD') {
      await this.orders.release(itemId, item.stage, actor, true);
    }

    return (await this.dtos([{ id: itemId, makerId: body.makerId ?? item.makerId }])).get(itemId)!;
  }

  /** Who can be picked for each station, with the jobs at or still coming to them. */
  async options(): Promise<TeamOptionsDto> {
    const [people, tailors] = await Promise.all([
      Promise.all(TEAM_STATIONS.map((s) => this.identity.usersWithRole(TEAM_STATION_ROLE[s]))),
      this.makers.list(),
    ]);
    const userIds = [...new Set(people.flat().map((u) => u.id))];
    const assignments = await this.repo.listAssignmentsForUsers(userIds);
    const items = new Map((await this.orders.findItemsByIds([...new Set(assignments.map((a) => a.orderItemId))])).map((i) => [i.id, i]));
    const load = new Map<string, number>(); // `${station}:${userId}` → active jobs
    for (const a of assignments) {
      const item = items.get(a.orderItemId);
      if (!item || CLOSED.includes(item.stage) || item.order.status !== 'PAID') continue;
      // Still to do: the job has not moved past this person's station yet.
      if (stationIndex(item.stage, item.heldFromStage) > WORKSHOP_STATIONS.indexOf(a.station as TeamStation)) continue;
      const key = `${a.station}:${a.userId}`;
      load.set(key, (load.get(key) ?? 0) + 1);
    }
    const options = (station: TeamStation, list: { id: string; name: string | null; email: string | null }[]): TeamOptionDto[] =>
      list.map((u) => ({ id: u.id, name: u.name ?? u.email, activeJobs: load.get(`${station}:${u.id}`) ?? 0 }));
    const [pattern, cutting, qc, finishing] = TEAM_STATIONS.map((s, i) => options(s, people[i]!));
    return {
      pattern: pattern!,
      cutting: cutting!,
      stitching: tailors.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name, activeJobs: t.activeItemCount })),
      qc: qc!,
      finishing: finishing!,
    };
  }
}
