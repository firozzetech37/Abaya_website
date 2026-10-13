import { Inject, Injectable } from '@nestjs/common';
import {
  type CuttingBody,
  missingForCutting,
  type StitchingBody,
  STITCHING_PROBLEM_LABELS,
  type StitchingProblemType,
  type TailorEarningsDto,
  type PatternBody,
  type PatternStationDto,
  type ProductionStage,
  STATION_STAGES,
  stationsForRoles,
  type UploadUrlResponse,
  type WorkshopAction,
  type WorkshopBriefDto,
  type WorkshopDoneItemDto,
  type WorkshopItemDetail,
  type WorkshopQueueItem,
  type WorkshopStation,
  type WorkshopStationSummary,
  type WorkshopStepResult,
} from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError, DomainError, ForbiddenError, NotFoundError } from '../../../common/errors/domain-error';
import { IdentityService } from '../../identity/application/identity.service';
import { UploadsService } from '../../media/application/uploads.service';
import { OrdersService } from '../../orders/application/orders.service';
import { type ItemWithOrder, ORDER_MEDIA, type OrderMedia } from '../../orders/application/ports/orders.ports';
import { bodyMeasurements, mayEditPattern, suggestPattern } from '../domain/pattern.rules';
import { actionsFor, isOverdue, mayContactCustomer, mayOpen, stationOfItem } from '../domain/workshop.rules';
import { CatalogService } from '../../catalog/application/catalog.service';
import { CuttingService } from './cutting.service';
import { MakersService } from './makers.service';
import { PatternService } from './pattern.service';
import { StitchingService, stitchingExpectations } from './stitching.service';
import { type ItemTeam, TeamService } from './team.service';
import { type PatternRecord, PRODUCTION_REPOSITORY, type ProductionRepository } from './ports/production.ports';

type QueueView = 'all' | 'mine' | 'overdue' | 'on-hold';

const isManager = (actor: Actor) => actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('PRODUCTION_MANAGER');

/** Only the numbers a garment is made from; drops profile names and free-text notes. */
function numericMeasurements(snapshot: Record<string, number | string | null> | null): Record<string, number> | null {
  if (!snapshot) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(snapshot)) if (k.endsWith('Cm') && typeof v === 'number') out[k] = v;
  return out;
}

/** The body points a pattern starts from, in reading order. */
const BRIEF_POINTS = ['bustCm', 'waistCm', 'hipCm', 'shoulderCm', 'sleeveLengthCm', 'fullLengthCm', 'wristCm'];

/** Key facts for a queue card: body measurements, chosen options, pattern progress. */
function brief(item: ItemWithOrder, pattern: PatternRecord | undefined): WorkshopBriefDto {
  const m = numericMeasurements(item.measurementsSnapshot) ?? {};
  return {
    measurements: BRIEF_POINTS.filter((k) => m[k] !== undefined).map((k) => ({ key: k, cm: m[k]! })),
    options: item.optionsSnapshot.map((o) => ({ group: o.groupName, value: o.valueName })),
    pattern: pattern ? { version: pattern.version, status: pattern.status, missing: missingForCutting(pattern.content) } : null,
  };
}

/**
 * The /workshop website (docs/apps/workshop.md): one queue per station, a job card per
 * item, and the station's step. Every station except Logistics works without knowing
 * who the customer is. Tailors see only items assigned to their own tailor account.
 */
@Injectable()
export class WorkshopService {
  constructor(
    @Inject(PRODUCTION_REPOSITORY) private readonly repo: ProductionRepository,
    @Inject(ORDER_MEDIA) private readonly media: OrderMedia,
    private readonly orders: OrdersService,
    private readonly identity: IdentityService,
    private readonly makers: MakersService,
    private readonly uploads: UploadsService,
    private readonly patterns: PatternService,
    private readonly cuttings: CuttingService,
    private readonly stitchings: StitchingService,
    private readonly catalog: CatalogService,
    private readonly team: TeamService,
  ) {}

  /** Counts for the station cards on /workshop. */
  async summary(actor: Actor): Promise<WorkshopStationSummary[]> {
    const stations = stationsForRoles(actor.roles);
    const now = new Date();
    const result: WorkshopStationSummary[] = [];
    for (const station of stations) {
      const { items, teams } = await this.itemsFor(actor, station);
      result.push({
        station,
        waiting: items.filter((i) => i.stage !== 'ON_HOLD').length,
        mine: items.filter((i) => this.isMine(actor, i, teams)).length,
        overdue: items.filter((i) => isOverdue(i.dueDate, now)).length,
        onHold: items.filter((i) => i.stage === 'ON_HOLD').length,
      });
    }
    return result;
  }

  async queue(actor: Actor, station: WorkshopStation, view: QueueView): Promise<WorkshopQueueItem[]> {
    this.assertStation(actor, station);
    const now = new Date();
    const { items: all, teams } = await this.itemsFor(actor, station);
    const items = all.filter((i) =>
      view === 'mine'
        ? this.isMine(actor, i, teams)
        : view === 'overdue'
          ? isOverdue(i.dueDate, now)
          : view === 'on-hold'
            ? i.stage === 'ON_HOLD'
            : true,
    );
    return this.toQueueItems(items, now, teams);
  }

  /**
   * A station's finished work (last 30 days): what this person moved on from the station,
   * or for managers what anyone did. Where the job is now, and when it left.
   */
  async done(actor: Actor, station: WorkshopStation): Promise<WorkshopDoneItemDto[]> {
    this.assertStation(actor, station);
    const manager = isManager(actor);
    const steps = await this.orders.listDoneSteps([...STATION_STAGES[station]], {
      actorUserId: manager ? undefined : actor.userId,
      since: new Date(Date.now() - 30 * 86_400_000),
    });
    // One row per job: its latest step out of this station.
    const latest = new Map<string, (typeof steps)[number]>();
    for (const step of steps) if (!latest.has(step.orderItemId)) latest.set(step.orderItemId, step);
    const [items, people] = await Promise.all([
      this.orders.findItemsByIds([...latest.keys()]),
      this.identity.getContacts([...latest.values()].flatMap((s) => (s.actorUserId ? [s.actorUserId] : []))),
    ]);
    const byId = new Map(items.map((i) => [i.id, i]));
    return [...latest.values()].flatMap((step) => {
      const i = byId.get(step.orderItemId);
      if (!i) return [];
      const person = step.actorUserId ? people.get(step.actorUserId) : undefined;
      return [
        {
          id: i.id,
          orderNumber: i.order.orderNumber,
          designName: i.designSnapshot.name,
          style: i.designSnapshot.style as WorkshopDoneItemDto['style'],
          primaryImageUrl: this.media.designImageUrl(i.designSnapshot.primaryImagePath),
          sizeBandCode: i.sizeBandCode,
          stage: i.stage,
          toStage: step.toStage,
          doneAt: step.createdAt.toISOString(),
          doneBy: step.actorUserId ? { id: step.actorUserId, name: person?.name ?? person?.email ?? null } : null,
          note: step.note,
          canOpen: manager,
        },
      ];
    });
  }

  async item(actor: Actor, itemId: string): Promise<WorkshopItemDetail> {
    const { item, ownMakerId, assignedToId } = await this.requireOpenable(actor, itemId);
    const now = new Date();
    const [queueItem] = await this.toQueueItems([item], now);
    const team = (await this.team.dtos([item])).get(itemId)!;
    const [pack, qcChecks, patterns, cuttings, stitchings] = await Promise.all([
      this.repo.findTechPack(itemId),
      this.repo.listQcChecks([itemId]),
      this.patterns.list(itemId),
      this.cuttings.byItem([itemId]),
      this.stitchings.byItem([itemId]),
    ]);
    // The tailor sees what this piece pays (their own job; managers see it too).
    const station = stationOfItem(item.stage, item.heldFromStage);
    const seesPay = station === 'stitching' && (isManager(actor) || (ownMakerId !== null && item.makerId === ownMakerId));
    const makingCharge = seesPay ? await this.catalog.getMakingCost(item.designId) : null;
    // Later stations work from the confirmed pattern (the newest confirmed version).
    const confirmed = patterns.find((p) => p.status === 'CONFIRMED');
    const approved = pack?.status === 'APPROVED' ? pack.content : null;
    const actors = await this.identity.getContacts(item.stageEvents.flatMap((e) => (e.actorUserId ? [e.actorUserId] : [])));
    const showContact = mayContactCustomer(actor.roles);
    const contact = showContact ? await this.identity.getContact(item.order.userId) : null;

    return {
      ...queueItem!,
      orderId: item.orderId,
      station: stationOfItem(item.stage, item.heldFromStage),
      options: item.optionsSnapshot.map((o) => ({ groupName: o.groupName, valueName: o.valueName })),
      measurements: numericMeasurements(item.measurementsSnapshot),
      techPack: approved,
      referenceImageUrls: approved ? await Promise.all(approved.referenceImagePaths.map((p) => this.media.stagePhotoUrl(p))) : [],
      aiPreview: item.aiPreviewPath ? { url: await this.media.stagePhotoUrl(item.aiPreviewPath), inspirationOnly: item.aiPreviewInspiration } : null,
      qcChecks: await Promise.all(
        qcChecks.map(async (c) => ({
          result: c.result,
          checklist: c.checklist,
          notes: c.notes,
          photoUrls: await Promise.all(c.photoPaths.map((p) => this.media.stagePhotoUrl(p))),
          createdAt: c.createdAt.toISOString(),
        })),
      ),
      events: await Promise.all(
        item.stageEvents.map(async (e) => ({
          fromStage: e.fromStage,
          toStage: e.toStage,
          note: e.note,
          photoUrl: e.photoPath ? await this.media.stagePhotoUrl(e.photoPath) : null,
          actorName: e.actorUserId ? (actors.get(e.actorUserId)?.name ?? null) : null,
          createdAt: e.createdAt.toISOString(),
        })),
      ),
      pattern: confirmed ? await this.patterns.toDto(confirmed) : null,
      cuttings: cuttings.get(itemId) ?? [],
      stitchings: stitchings.get(itemId) ?? [],
      team,
      makingChargeInPaise: makingCharge ?? null,
      customer: contact ? { name: contact.name ?? item.order.shippingAddress.fullName, phone: item.order.shippingAddress.phone } : null,
      shippingAddress: showContact ? item.order.shippingAddress : null,
      actions: this.actions(actor, item, ownMakerId, assignedToId),
    };
  }

  async claim(actor: Actor, itemId: string): Promise<WorkshopItemDetail> {
    const { item, ownMakerId, assignedToId } = await this.requireOpenable(actor, itemId);
    this.requireAction(actor, item, ownMakerId, assignedToId, 'claim');
    if (!(await this.orders.claim(itemId, item.stage, actor))) {
      throw new DomainError('CONFLICT', 'JOB_TAKEN', 'Someone else has just taken this job.');
    }
    return this.item(actor, itemId);
  }

  async release(actor: Actor, itemId: string): Promise<WorkshopItemDetail> {
    const { item, ownMakerId, assignedToId } = await this.requireOpenable(actor, itemId);
    this.requireAction(actor, item, ownMakerId, assignedToId, 'release');
    await this.orders.release(itemId, item.stage, actor, isManager(actor));
    return this.item(actor, itemId);
  }

  /**
   * Stop work with a question (pattern, cutting) or, at stitching, a problem with the cut kit
   * (type + photo). The production manager sees it on the order page and decides.
   */
  async hold(
    actor: Actor,
    itemId: string,
    reason: string,
    problem?: { type?: StitchingProblemType; photoPath?: string },
  ): Promise<WorkshopItemDetail> {
    const { item, ownMakerId, assignedToId } = await this.requireOpenable(actor, itemId);
    this.requireAction(actor, item, ownMakerId, assignedToId, 'hold');
    if (problem?.type && item.stage !== 'STITCHING') {
      throw new BusinessRuleError('PROBLEM_ONLY_AT_STITCHING', 'Problem reports are for the stitching station.');
    }
    if (problem?.photoPath) this.uploads.assertPath('STAGE_PHOTO', problem.photoPath);
    const note = problem?.type ? `${STITCHING_PROBLEM_LABELS[problem.type]}: ${reason}` : reason;
    await this.orders.changeStage(itemId, 'ON_HOLD', actor, { flow: 'hold', note, photoPath: problem?.photoPath });
    return this.item(actor, itemId);
  }

  /** Carry on where it stopped; for a stitching problem the production manager may choose a re-cut (to CUTTING). */
  async resume(actor: Actor, itemId: string, note?: string, to?: ProductionStage): Promise<WorkshopItemDetail> {
    const { item, ownMakerId, assignedToId } = await this.requireOpenable(actor, itemId);
    const options = this.actions(actor, item, ownMakerId, assignedToId).filter((a) => a.kind === 'resume');
    const action = to ? options.find((a) => a.to === to) : options[0];
    if (!action) throw new BusinessRuleError('STEP_NOT_AVAILABLE', 'This step is not available for this item right now.');
    const fallback = action.to === 'CUTTING' && item.heldFromStage === 'STITCHING' ? 'Sent back for a re-cut' : 'Query resolved';
    await this.orders.changeStage(itemId, action.to!, actor, { flow: 'hold', note: note?.trim() || fallback });
    return this.item(actor, itemId);
  }

  /** The station's step: start/confirm pattern, cut, stitched, packed, delivered. */
  async advance(actor: Actor, itemId: string, to: ProductionStage, note?: string, photoPath?: string): Promise<WorkshopStepResult> {
    const { item, ownMakerId, assignedToId } = await this.requireOpenable(actor, itemId);
    const action = this.actions(actor, item, ownMakerId, assignedToId).find((a) => (a.kind === 'advance' || a.kind === 'deliver') && a.to === to);
    if (!action) throw new BusinessRuleError('STEP_NOT_AVAILABLE', 'This step is not available for this item right now.');
    if (action.kind === 'deliver') {
      await this.orders.markDelivered(itemId, actor, note);
    } else {
      // Pattern → cutting only with a complete pattern, which is confirmed here.
      if (item.stage === 'PATTERN' && to === 'CUTTING') await this.patterns.confirmForCutting(actor, itemId);
      if (item.stage === 'CUTTING' && to === 'STITCHING') {
        throw new BusinessRuleError('USE_CUTTING_FORM', 'Record the cut (lot, metres, pieces, photo) with “Cutting done”.');
      }
      if (item.stage === 'STITCHING' && to === 'QC') {
        throw new BusinessRuleError('USE_STITCHING_FORM', 'Finish the checklist and measurements with “Stitching done”.');
      }
      // Starting a pattern takes the job for whoever started it.
      await this.orders.changeStage(itemId, to, actor, { flow: 'generic', note, photoPath, claim: to === 'PATTERN' });
    }
    // The item usually moves on to the next station, out of the caller's reach.
    return { item: await this.item(actor, itemId).catch(() => null) };
  }

  /** The pattern to edit (pattern station) or read (later stations), with a prefill for new versions. */
  async pattern(actor: Actor, itemId: string): Promise<PatternStationDto> {
    const { item } = await this.requireOpenable(actor, itemId);
    const [versions, pack] = await Promise.all([this.patterns.list(itemId), this.repo.findTechPack(itemId)]);
    const style = item.designSnapshot.style as PatternStationDto['suggestion']['style'];
    const suggestion = suggestPattern({
      style,
      body: bodyMeasurements(pack?.status === 'APPROVED' ? pack.content.measurements : null, item.measurementsSnapshot),
      options: item.optionsSnapshot,
    });
    const [current, ...previous] = await Promise.all(versions.map((v) => this.patterns.toDto(v)));
    return {
      current: current ?? null,
      previous,
      editable: mayEditPattern({ stage: item.stage, roles: actor.roles, claimedById: item.claimedById, actorId: actor.userId }),
      suggestion: { ...suggestion, style },
      missing: versions[0] ? missingForCutting(versions[0].content) : ['measurements', 'pieces', 'fabric', 'files'],
    };
  }

  async savePattern(actor: Actor, itemId: string, body: PatternBody): Promise<PatternStationDto> {
    const { item } = await this.requireOpenable(actor, itemId);
    if (!mayEditPattern({ stage: item.stage, roles: actor.roles, claimedById: item.claimedById, actorId: actor.userId })) {
      throw new BusinessRuleError('PATTERN_NOT_EDITABLE', 'Start the pattern (take the job) before editing it.');
    }
    for (const f of body.files) this.uploads.assertPath('PATTERN_FILE', f.path);
    await this.patterns.saveDraft(itemId, body, actor);
    return this.pattern(actor, itemId);
  }

  /**
   * Cutting done: the cut is checked against the confirmed pattern and recorded, and the
   * item moves on to stitching with the cut-pieces photo.
   */
  async completeCutting(actor: Actor, itemId: string, body: CuttingBody): Promise<WorkshopStepResult> {
    const { item, ownMakerId, assignedToId } = await this.requireOpenable(actor, itemId);
    const step = this.actions(actor, item, ownMakerId, assignedToId).find((a) => a.kind === 'advance' && a.to === 'STITCHING');
    if (!step) throw new BusinessRuleError('STEP_NOT_AVAILABLE', 'This step is not available for this item right now.');
    const pattern = (await this.patterns.list(itemId)).find((p) => p.status === 'CONFIRMED') ?? null;
    this.cuttings.assertComplete(body, pattern);
    const metres = (body.fabricUsedCm / 100).toFixed(2);
    await this.orders.changeStage(itemId, 'STITCHING', actor, {
      flow: 'generic',
      photoPath: body.photoPath,
      note: `Cut from lot ${body.fabricLot.trim()} · ${metres} m${body.notes.trim() ? ` · ${body.notes.trim()}` : ''}`,
    });
    await this.cuttings.record(actor, itemId, body, pattern!);
    return { item: await this.item(actor, itemId).catch(() => null) };
  }

  /**
   * Stitching done: checklist and measurement self-check against the confirmed pattern,
   * the finished-piece photo, then on to QC. The tailor must have started the job.
   */
  async completeStitching(actor: Actor, itemId: string, body: StitchingBody): Promise<WorkshopStepResult> {
    const { item, ownMakerId, assignedToId } = await this.requireOpenable(actor, itemId);
    const step = this.actions(actor, item, ownMakerId, assignedToId).find((a) => a.kind === 'advance' && a.to === 'QC');
    if (!step) throw new BusinessRuleError('STEP_NOT_AVAILABLE', 'This step is not available for this item right now.');
    if (item.claimedById !== actor.userId && !isManager(actor)) {
      throw new BusinessRuleError('STITCHING_NOT_STARTED', 'Press “Start stitching” first.');
    }
    const [pack, patterns] = await Promise.all([this.repo.findTechPack(itemId), this.patterns.list(itemId)]);
    const expected = stitchingExpectations(pack, patterns.find((p) => p.status === 'CONFIRMED') ?? null);
    this.stitchings.assertComplete(body, expected);
    await this.orders.changeStage(itemId, 'QC', actor, {
      flow: 'generic',
      photoPath: body.photoPath,
      note: body.notes.trim() || undefined,
    });
    await this.stitchings.record(actor, item, body, expected);
    return { item: await this.item(actor, itemId).catch(() => null) };
  }

  /** The tailor's own payouts. */
  async earnings(actor: Actor): Promise<TailorEarningsDto> {
    const makerId = await this.ownMaker(actor);
    if (!makerId) throw new ForbiddenError('This login is not linked to an active tailor account.', 'NOT_A_MAKER');
    return this.stitchings.earnings(makerId);
  }

  /** Signed URL for one station photo (private bucket). */
  async createUpload(
    actor: Actor,
    input: {
      contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | 'application/dxf';
      purpose: 'STAGE_PHOTO' | 'QC_PHOTO' | 'PATTERN_FILE';
    },
  ): Promise<UploadUrlResponse> {
    if (stationsForRoles(actor.roles).length === 0) throw new ForbiddenError();
    return this.uploads.createUploadUrl(actor, input);
  }

  // ───────────── helpers ─────────────

  private assertStation(actor: Actor, station: WorkshopStation): void {
    if (!stationsForRoles(actor.roles).includes(station)) throw new ForbiddenError('This is not your station.', 'NOT_YOUR_STATION');
  }

  /**
   * Items of one station with their teams. Tailors (without manager rights) only get their
   * own; at other stations a job assigned to someone else is not shown.
   */
  private async itemsFor(actor: Actor, station: WorkshopStation): Promise<{ items: ItemWithOrder[]; teams: Map<string, ItemTeam> }> {
    let makerId: string | undefined;
    if (station === 'stitching' && !isManager(actor)) {
      const maker = await this.ownMaker(actor);
      if (!maker) return { items: [], teams: new Map() };
      makerId = maker;
    }
    const all = await this.orders.listForWorkshop([...STATION_STAGES[station]], { makerId });
    const teams = await this.team.byItem(all.map((i) => i.id));
    const items = isManager(actor)
      ? all
      : all.filter((i) => {
          const assignee = this.team.assigneeAt(i, teams.get(i.id));
          return assignee === null || assignee === actor.userId;
        });
    return { items, teams };
  }

  /** "My jobs": assigned to me, started by me, or (tailors) my own stitching. */
  private isMine(actor: Actor, item: ItemWithOrder, teams: Map<string, ItemTeam>): boolean {
    if (item.claimedById === actor.userId) return true;
    if (this.team.assigneeAt(item, teams.get(item.id)) === actor.userId) return true;
    return item.stage === 'STITCHING' && actor.roles.includes('MAKER') && !isManager(actor);
  }

  private ownMaker(actor: Actor): Promise<string | null> {
    return this.makers.ownMakerId(actor);
  }

  private async requireOpenable(
    actor: Actor,
    itemId: string,
  ): Promise<{ item: ItemWithOrder; ownMakerId: string | null; assignedToId: string | null }> {
    const item = await this.orders.getItem(itemId).catch(() => null);
    const ownMakerId = await this.ownMaker(actor);
    const station = item ? stationOfItem(item.stage, item.heldFromStage) : null;
    const assignedToId = item ? this.team.assigneeAt(item, (await this.team.byItem([itemId])).get(itemId)) : null;
    const isOwnStitching = ownMakerId !== null && item?.makerId === ownMakerId;
    // Things that are not theirs look like they do not exist.
    if (!item || item.order.status !== 'PAID' || !mayOpen(actor.roles, actor.userId, station, { isOwnStitching, assignedToId })) {
      throw new NotFoundError('Item');
    }
    return { item, ownMakerId, assignedToId };
  }

  private actions(actor: Actor, item: ItemWithOrder, ownMakerId: string | null, assignedToId: string | null): WorkshopAction[] {
    return actionsFor(actor.roles, actor.userId, {
      stage: item.stage,
      heldFromStage: item.heldFromStage,
      claimedById: item.claimedById,
      isOwnStitching: ownMakerId !== null && item.makerId === ownMakerId,
      assignedToId,
    });
  }

  private requireAction(
    actor: Actor,
    item: ItemWithOrder,
    ownMakerId: string | null,
    assignedToId: string | null,
    kind: WorkshopAction['kind'],
  ): WorkshopAction {
    const action = this.actions(actor, item, ownMakerId, assignedToId).find((a) => a.kind === kind);
    if (!action) throw new BusinessRuleError('STEP_NOT_AVAILABLE', 'This step is not available for this item right now.');
    return action;
  }

  private async toQueueItems(items: ItemWithOrder[], now: Date, knownTeams?: Map<string, ItemTeam>): Promise<WorkshopQueueItem[]> {
    const teams = knownTeams ?? (await this.team.byItem(items.map((i) => i.id)));
    const patterns = await this.repo.latestPatterns(items.filter((i) => stationOfItem(i.stage, i.heldFromStage) === 'pattern').map((i) => i.id));
    const assignees = new Map(items.map((i) => [i.id, this.team.assigneeAt(i, teams.get(i.id))]));
    const [people, makers] = await Promise.all([
      this.identity.getContacts([
        ...items.flatMap((i) => (i.claimedById ? [i.claimedById] : [])),
        ...[...assignees.values()].filter((a): a is string => a !== null),
      ]),
      this.makers.namesById(items.flatMap((i) => (i.makerId ? [i.makerId] : []))),
    ]);
    return items.map((i) => ({
      id: i.id,
      orderNumber: i.order.orderNumber,
      designName: i.designSnapshot.name,
      style: i.designSnapshot.style as WorkshopQueueItem['style'],
      primaryImageUrl: this.media.designImageUrl(i.designSnapshot.primaryImagePath),
      sizeBandCode: i.sizeBandCode,
      stage: i.stage,
      heldFromStage: i.heldFromStage,
      holdReason: i.holdReason,
      dueDate: i.dueDate?.toISOString() ?? null,
      isOverdue: isOverdue(i.dueDate, now),
      claimedBy: i.claimedById ? { id: i.claimedById, name: people.get(i.claimedById)?.name ?? null } : null,
      claimedAt: i.claimedAt?.toISOString() ?? null,
      makerName: i.makerId ? (makers.get(i.makerId)?.name ?? null) : null,
      brief: brief(i, patterns.get(i.id)),
      assignedTo: assignees.get(i.id)
        ? { id: assignees.get(i.id)!, name: people.get(assignees.get(i.id)!)?.name ?? people.get(assignees.get(i.id)!)?.email ?? null }
        : null,
      isRework: i.stageEvents.some((e) => e.fromStage === 'QC' && e.toStage !== 'FINISHING') || i.stageEvents.some((e) => e.toStage === 'REMAKE'),
      stageSince: (i.stageEvents.at(-1)?.createdAt ?? i.order.createdAt).toISOString(),
    }));
  }
}

