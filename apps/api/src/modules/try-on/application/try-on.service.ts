import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminCustomerPreviewDto,
  type AdminCustomerPreviewSummaryDto,
  type CreateCustomerPreviewBody,
  type CreateTryOnBody,
  CUSTOMER_PREVIEW_CREDITS,
  type CustomerAiLimitsDto,
  type CustomerPreviewDto,
  type CustomerPreviewKind,
  type CustomerPreviewStatus,
  type MyAiPicturesDto,
  type Paginated,
  type RecentAiPicturesDto,
  previewKey,
  type UploadUrlResponse,
} from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import { DesignsAdminService } from '../../catalog/application/designs-admin.service';
import { UploadsService } from '../../media/application/uploads.service';
import {
  changesToShow,
  choiceLines,
  ENDPOINT,
  INACCURATE_MESSAGE,
  INACCURATE_TRYON_MESSAGE,
  PHOTO_QUESTION,
  BACKGROUND_NOT_ALLOWED,
  BACKGROUND_SCENES,
  backgroundQuestion,
  planCredits,
  TRYON_SOURCE_SIDE,
  photoTip,
  previewPlan,
  sourceImage,
  startOfIndiaDay,
  tryOnExpiry,
  tryOnPlan,
  requestQuestion,
  REQUEST_NOT_ALLOWED,
  REQUEST_UNAVAILABLE,
  MODEL_TRYON_LINE,
  WORDS_LINE,
  LEFT_OUT_LINE,
} from '../domain/try-on.rules';
import {
  CUSTOMER_PREVIEW_REPOSITORY,
  type CustomerPreviewRecord,
  type CustomerPreviewRepository,
  type CustomerUsageRow,
  FASHN_CLIENT,
  type FashnClient,
  PREVIEW_CHECKER,
  type PreviewChecker,
  TRYON_FILES,
  type TryOnFiles,
} from './ports/try-on.ports';

const mimeOf = (path: string) => (path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

/** Links to a result the customer (or the admin) is looking at. */
const RESULT_URL_TTL_SECONDS = 60 * 60;

/** At most this many recent pictures are listed under the AI studio. */
/** A try-on in another colour than photographed (her customised version, from that colour's photo). */
const CUSTOM_COLOUR_LINE = 'Customised colour';
const RECENT_LIMIT = 12;
/** At most this many on her profile (a day's allowance is far fewer, and each lasts an hour). */
const MINE_LIMIT = 60;

type Limits = Pick<
  AppConfig,
  'CUSTOMER_PREVIEW_DAILY_LIMIT' | 'CUSTOMER_TRYON_DAILY_LIMIT' | 'CUSTOMER_AI_DAILY_CREDIT_LIMIT' | 'CUSTOMER_AI_KEEP_MINUTES'
>;

/**
 * "Preview my design" and "Try it on" on the website. Previews are shared between customers
 * (same design + options = made once, then free). Try-ons are private to the customer and
 * deleted after 30 days; staff never see them. Neither ever changes the order or its price.
 */
@Injectable()
export class TryOnService {
  constructor(
    @Inject(CUSTOMER_PREVIEW_REPOSITORY) private readonly repo: CustomerPreviewRepository,
    @Inject(TRYON_FILES) private readonly files: TryOnFiles,
    @Inject(FASHN_CLIENT) private readonly fashn: FashnClient,
    @Inject(PREVIEW_CHECKER) private readonly checker: PreviewChecker,
    @Inject(APP_CONFIG) private readonly config: Limits,
    private readonly designs: DesignsAdminService,
    private readonly uploads: UploadsService,
  ) {}

  async limits(actor: Actor, now = new Date()): Promise<CustomerAiLimitsDto> {
    const since = startOfIndiaDay(now);
    const [previews, tryOns, credits] = await Promise.all([
      this.repo.countByUserSince(actor.userId, 'PREVIEW', since),
      this.repo.countByUserSince(actor.userId, 'TRYON', since),
      this.repo.creditsSince(since),
    ]);
    return {
      previewsLeft: Math.max(0, this.config.CUSTOMER_PREVIEW_DAILY_LIMIT - previews),
      previewsPerDay: this.config.CUSTOMER_PREVIEW_DAILY_LIMIT,
      tryOnsLeft: Math.max(0, this.config.CUSTOMER_TRYON_DAILY_LIMIT - tryOns),
      tryOnsPerDay: this.config.CUSTOMER_TRYON_DAILY_LIMIT,
      available: credits + 1 <= this.config.CUSTOMER_AI_DAILY_CREDIT_LIMIT,
      live: this.fashn.live,
      wording: this.checker.available,
      keepMinutes: this.config.CUSTOMER_AI_KEEP_MINUTES,
    };
  }

  /** The design with her options. Reuses a shared preview when one exists (free, no limit used). */
  async createPreview(actor: Actor, body: CreateCustomerPreviewBody, now = new Date()): Promise<CustomerPreviewDto> {
    const subject = await this.subject(body.designId);
    const known = new Set(subject.options.map((o) => o.id));
    if (body.selectedOptionValueIds.some((id) => !known.has(id))) {
      throw new BusinessRuleError('UNKNOWN_OPTION', 'One of the chosen options is not available for this design.');
    }
    // Her own words, cleaned by Gemini to surface changes only. When present they make the
    // picture on their own: the chosen options still drive the order and the price, not the preview.
    const typed = (body.request ?? '').trim().replace(/\s+/g, ' ');
    let request: string | null = null;
    let leftOut: string[] = [];
    if (typed) {
      if (!this.checker.available) throw new BusinessRuleError('REQUEST_UNAVAILABLE', REQUEST_UNAVAILABLE);
      const verdict = await this.checker.classifyRequest(requestQuestion(typed));
      if (!verdict) throw new BusinessRuleError('REQUEST_UNAVAILABLE', REQUEST_UNAVAILABLE);
      if (!verdict.kept) throw new BusinessRuleError('REQUEST_NOT_ALLOWED', REQUEST_NOT_ALLOWED, { leftOut: verdict.leftOut });
      request = verdict.kept;
      leftOut = verdict.leftOut;
    }
    const key = previewKey(subject.id, body.selectedOptionValueIds, request);
    const shared = await this.repo.findShared(key);
    if (shared) return this.toDto(shared, leftOut, await this.giveTo(actor, shared.id, now));

    // With words the default photo is the canvas; otherwise the photo closest to her colour.
    const colourId = request
      ? null
      : (subject.options.find((o) => o.groupCode === 'COLOUR' && body.selectedOptionValueIds.includes(o.id))?.id ?? null);
    const source = sourceImage(subject.images, subject.options, colourId);
    if (!source) throw new NotFoundError('Design');
    const changes = request ? [] : changesToShow(subject.options, body.selectedOptionValueIds, source.showsColour);
    const plan = previewPlan(subject.style, subject.options, body.selectedOptionValueIds, changes, request);
    if (plan.steps.length === 0) {
      throw new BusinessRuleError(
        'NOTHING_TO_PREVIEW',
        'The photos already show these choices. Change an option to see your own version.',
      );
    }
    const credits = plan.steps.length * CUSTOMER_PREVIEW_CREDITS.PREVIEW;
    await this.assertAllowance(actor, 'PREVIEW', credits, now);
    const created = await this.repo.create({
      userId: actor.userId,
      kind: 'PREVIEW',
      designId: subject.id,
      previewKey: key,
      selectedOptionValueIds: [...new Set(body.selectedOptionValueIds)],
      choices: request
        ? [`${WORDS_LINE}${request}`, ...leftOut.map((part) => `${LEFT_OUT_LINE}${part}`)]
        : choiceLines(subject.options, body.selectedOptionValueIds),
      sourcePath: source.image.storagePath,
      personPath: null,
      basePreviewId: null,
      prompt: plan.steps.join('\n\n'),
      steps: plan.steps,
      checks: plan.checks,
      endpoint: ENDPOINT.PREVIEW,
      credits,
      expiresAt: null,
    });
    return this.toDto(created, undefined, await this.giveTo(actor, created.id, now));
  }

  /** Where she uploads her photo (private bucket, deleted with the try-on). */
  uploadUrl(actor: Actor, contentType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<UploadUrlResponse> {
    return this.uploads.createUploadUrl(actor, { purpose: 'TRYON_PHOTO', contentType });
  }

  async createTryOn(actor: Actor, body: CreateTryOnBody, now = new Date()): Promise<CustomerPreviewDto> {
    const subject = await this.subject(body.designId);
    // Her own photo (PHOTO), or no photo at all: a model with her build (MODEL).
    const personPath = body.mode === 'PHOTO' ? (body.personPath ?? null) : null;
    if (personPath) this.uploads.assertPath('TRYON_PHOTO', personPath);

    let sourcePath: string;
    let basePreviewId: string | null = null;
    // Another colour than the one photographed: her customised version (from that colour's photo).
    let otherColour = false;
    if (body.previewId) {
      const preview = await this.repo.findById(body.previewId);
      if (!preview || preview.kind !== 'PREVIEW' || preview.designId !== subject.id || preview.hidden || preview.purgedAt) {
        throw new NotFoundError('Preview');
      }
      if (preview.status !== 'DONE' || !preview.resultPath) {
        throw new BusinessRuleError('PREVIEW_NOT_READY', 'Wait for your preview to finish, then try it on.');
      }
      sourcePath = preview.resultPath;
      basePreviewId = preview.id;
    } else {
      const colourId = body.colourValueId ?? null;
      if (colourId && !subject.options.some((o) => o.id === colourId && o.groupCode === 'COLOUR')) {
        throw new BusinessRuleError('UNKNOWN_OPTION', 'This colour is not available for this design.');
      }
      const source = sourceImage(subject.images, subject.options, colourId);
      if (!source) throw new NotFoundError('Design');
      sourcePath = source.image.storagePath;
      otherColour = Boolean(colourId) && !subject.options.some((o) => o.id === colourId && o.isDefault);
    }

    // A new background: a ready-made scene, or her own words (only a place, light or mood; checked first).
    let background: string | null = body.backgroundPreset ? BACKGROUND_SCENES[body.backgroundPreset] : null;
    const typedBackground = (body.backgroundText ?? '').trim().replace(/\s+/g, ' ');
    if (typedBackground) {
      if (!this.checker.available) throw new BusinessRuleError('REQUEST_UNAVAILABLE', REQUEST_UNAVAILABLE);
      const verdict = await this.checker.classifyRequest(backgroundQuestion(typedBackground));
      if (!verdict) throw new BusinessRuleError('REQUEST_UNAVAILABLE', REQUEST_UNAVAILABLE);
      if (!verdict.kept) throw new BusinessRuleError('BACKGROUND_NOT_ALLOWED', BACKGROUND_NOT_ALLOWED, { leftOut: verdict.leftOut });
      background = verdict.kept;
    }
    const plan = tryOnPlan(subject.style, { mode: body.mode, body: body.body ?? null, background, figure: body.figure ?? null });
    const credits = planCredits(plan.endpoints);
    await this.assertAllowance(actor, 'TRYON', credits, now);
    // A design photo goes to FASHN as a small copy (made once); her photo is checked meanwhile.
    const [fashnSource] = await Promise.all([
      basePreviewId ? sourcePath : this.files.tryOnSource(sourcePath, TRYON_SOURCE_SIDE),
      personPath ? this.preparePhoto(personPath) : null,
    ]);
    sourcePath = fashnSource;
    const created = await this.repo.create({
      userId: actor.userId,
      kind: 'TRYON',
      designId: subject.id,
      previewKey: null,
      selectedOptionValueIds: [],
      // What she asked for, for her own reference (never her weight or measurements).
      choices: [
        body.mode === 'MODEL' ? MODEL_TRYON_LINE : body.body ? 'Try-on: my photo, made to my measurements' : 'Try-on: my photo',
        ...(otherColour ? [CUSTOM_COLOUR_LINE] : []),
        ...(body.backgroundPreset ? [`Background: ${body.backgroundPreset}`] : typedBackground ? [`Background: ${typedBackground}`] : []),
      ],
      sourcePath,
      personPath,
      basePreviewId,
      prompt: plan.steps.join('\n\n'),
      steps: plan.steps,
      stepEndpoints: plan.endpoints,
      checks: plan.checks,
      endpoint: plan.endpoints[0]!,
      credits,
      expiresAt: tryOnExpiry(now),
    });
    return this.toDto(created, undefined, await this.giveTo(actor, created.id, now));
  }

  /**
   * One of her AI pictures, while it is still hers to see (an hour after she got it). A shared
   * preview is visible to every customer who received it, each for her own hour.
   */
  async get(actor: Actor, id: string, now = new Date()): Promise<CustomerPreviewDto> {
    const row = await this.repo.findById(id);
    if (!row || row.purgedAt || !this.mayView(actor, row)) throw new NotFoundError('Preview');
    const until = await this.repo.accessUntil(row.id, actor.userId, now);
    if (!until) throw new NotFoundError('Preview');
    return this.toDto(row, undefined, until);
  }

  /**
   * "My AI pictures" on her profile: every preview and try-on she can still see, from every
   * abaya, newest first, each with when it disappears and the abaya it shows.
   */
  async mine(actor: Actor, now = new Date()): Promise<MyAiPicturesDto> {
    const rows = (await this.repo.listMine(actor.userId, now, MINE_LIMIT)).filter(({ row }) => this.mayView(actor, row));
    const designIds = [...new Set(rows.map(({ row }) => row.designId))];
    const designs = new Map(await Promise.all(designIds.map(async (id) => [id, await this.designs.customisationSubject(id)] as const)));
    return {
      items: await Promise.all(
        rows.map(async ({ row, expiresAt }) => {
          const d = designs.get(row.designId);
          return { ...(await this.toDto(row, undefined, expiresAt)), design: d ? { name: d.name, slug: d.slug } : null };
        }),
      ),
    };
  }

  /** Her recent previews and try-ons of one design, newest first (the strip under the AI studio). */
  async recent(actor: Actor, designId: string, now = new Date()): Promise<RecentAiPicturesDto> {
    const rows = await this.repo.listRecent(actor.userId, designId, now, RECENT_LIMIT);
    const visible = rows.filter(({ row }) => this.mayView(actor, row));
    return { items: await Promise.all(visible.map(({ row, expiresAt }) => this.toDto(row, undefined, expiresAt))) };
  }

  /**
   * For her bag: a private copy of her website AI preview of exactly these choices (or, when she
   * only made one from her own words, that one as inspiration), so the workshop sees what she
   * imagined after her own copy is gone. Never a try-on (it shows her). null when there is none.
   */
  async previewForOrder(
    userId: string,
    designId: string,
    optionValueIds: string[],
    now = new Date(),
  ): Promise<{ path: string; inspirationOnly: boolean } | null> {
    const mine = (await this.repo.listRecent(userId, designId, now, RECENT_LIMIT))
      .map(({ row }) => row)
      .filter((r) => r.kind === 'PREVIEW' && r.status === 'DONE' && r.resultPath && !r.hidden);
    const key = previewKey(designId, optionValueIds);
    const words = (r: CustomerPreviewRecord) => ((r.choices ?? []) as string[]).some((c) => c.startsWith(WORDS_LINE));
    const match = mine.find((r) => r.previewKey === key && !words(r));
    const chosen = match ?? mine.find(words);
    if (!chosen?.resultPath) return null;
    const path = await this.uploads.copyPrivate(chosen.resultPath, 'ORDER_AI_PREVIEW');
    return path ? { path, inspirationOnly: !match } : null;
  }

  /** She may see this picture for CUSTOMER_AI_KEEP_MINUTES from now; returns until when. */
  private async giveTo(actor: Actor, previewId: string, now: Date): Promise<Date> {
    const until = new Date(now.getTime() + this.config.CUSTOMER_AI_KEEP_MINUTES * 60_000);
    await this.repo.grantAccess(previewId, actor.userId, now, until);
    return until;
  }

  /** She deletes her try-on (her photo and the result) straight away. */
  async remove(actor: Actor, id: string): Promise<void> {
    const row = await this.repo.findById(id);
    if (!row || row.kind !== 'TRYON' || row.userId !== actor.userId) throw new NotFoundError('Try-on');
    await this.files.remove([row.personPath, row.resultPath].filter((p): p is string => Boolean(p)));
    await this.repo.delete(row.id);
  }

  // ───────────── Admin (previews and "a model like me" try-ons; photo try-ons are private) ─────────────

  async summary(now = new Date()): Promise<AdminCustomerPreviewSummaryDto> {
    const since = startOfIndiaDay(now);
    const [previewsToday, tryOnsToday, creditsToday] = await Promise.all([
      this.repo.countSince('PREVIEW', since),
      this.repo.countSince('TRYON', since),
      this.repo.creditsSince(since),
    ]);
    return {
      previewsToday,
      tryOnsToday,
      creditsToday,
      dailyCreditLimit: this.config.CUSTOMER_AI_DAILY_CREDIT_LIMIT,
      live: this.fashn.live,
    };
  }

  async listPreviews(query: { cursor?: string; limit: number; userId?: string }): Promise<Paginated<AdminCustomerPreviewDto>> {
    const page = await this.repo.listPreviews(query);
    const ids = [...new Set(page.items.map((p) => p.designId))];
    const subjects = new Map(
      await Promise.all(ids.map(async (id) => [id, await this.designs.customisationSubject(id)] as const)),
    );
    const items = await Promise.all(
      page.items.map(async (p) => {
        const d = subjects.get(p.designId);
        return {
          id: p.id,
          kind: p.kind,
          design: { id: p.designId, name: d?.name ?? 'Design no longer live', slug: d?.slug ?? '' },
          choices: p.choices,
          status: p.status,
          imageUrl: await this.resultUrl(p),
          hidden: p.hidden,
          credits: p.credits,
          retries: p.retries,
          checkNotes: p.checkNotes,
          purgedAt: p.purgedAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        };
      }),
    );
    return { items, nextCursor: page.nextCursor };
  }

  /** Hide a bad preview: nobody is shown it again and the next request makes a new one. */
  async setHidden(id: string, hidden: boolean): Promise<void> {
    const row = await this.repo.findById(id);
    if (!row || row.kind !== 'PREVIEW') throw new NotFoundError('Preview');
    await this.repo.setHidden(id, hidden);
  }

  // ───────────── Helpers ─────────────

  private async subject(designId: string) {
    const subject = await this.designs.customisationSubject(designId);
    if (!subject) throw new NotFoundError('Design');
    return subject;
  }

  private async assertAllowance(actor: Actor, kind: CustomerPreviewKind, cost: number, now: Date): Promise<void> {
    const since = startOfIndiaDay(now);
    const perDay = kind === 'PREVIEW' ? this.config.CUSTOMER_PREVIEW_DAILY_LIMIT : this.config.CUSTOMER_TRYON_DAILY_LIMIT;
    const [mine, credits] = await Promise.all([
      this.repo.countByUserSince(actor.userId, kind, since),
      this.repo.creditsSince(since),
    ]);
    if (mine >= perDay) {
      throw new BusinessRuleError(
        kind === 'PREVIEW' ? 'DAILY_PREVIEW_LIMIT' : 'DAILY_TRYON_LIMIT',
        kind === 'PREVIEW'
          ? `You have used today's ${perDay} AI previews. Please come back tomorrow.`
          : `You have used today's ${perDay} try-ons. Please come back tomorrow.`,
        { limit: perDay },
      );
    }
    if (credits + cost > this.config.CUSTOMER_AI_DAILY_CREDIT_LIMIT) {
      throw new BusinessRuleError('AI_BUSY', 'AI pictures are not available for the rest of today. Please try again tomorrow.');
    }
  }

  /**
   * Before any credit is spent: her photo is turned upright and its hidden data (GPS location)
   * removed, then Gemini checks it is usable (one woman, standing, body visible, good light).
   * An unsuitable photo is deleted and she is told why. No checker: it goes ahead.
   */
  private async preparePhoto(path: string): Promise<void> {
    const cleaned = await this.uploads.cleanPhoto(path);
    if (!cleaned) throw new BusinessRuleError('PHOTO_MISSING', 'Your photo did not upload. Please choose it again.');
    if (!this.checker.available) return;
    const data = await this.files.read(path);
    const verdict = data ? await this.checker.assessPhoto({ data, mimeType: mimeOf(path) }, PHOTO_QUESTION) : null;
    if (verdict && !verdict.ok) {
      await this.files.remove([path]);
      throw new BusinessRuleError('PHOTO_NOT_SUITABLE', photoTip(verdict.reason), { reason: verdict.reason });
    }
  }

  private mayView(actor: Actor, row: CustomerPreviewRecord): boolean {
    if (row.kind === 'TRYON') return row.userId === actor.userId;
    return !row.hidden || row.userId === actor.userId;
  }

  /** The request a watermark points at (its id's first 8 hex digits); null when none. */
  async requestByIdPrefix(prefix: string): Promise<{
    id: string;
    kind: CustomerPreviewKind;
    designId: string;
    userId: string;
    createdAt: Date;
    choices: string[];
  } | null> {
    const row = await this.repo.findByIdPrefix(prefix);
    return row
      ? { id: row.id, kind: row.kind, designId: row.designId, userId: row.userId, createdAt: row.createdAt, choices: (row.choices ?? []) as string[] }
      : null;
  }

  // ───────────── FASHN usage (admin report; composed by the usage module) ─────────────

  /** Website previews and try-ons per customer in [since, until). */
  usageByUser(since: Date, until: Date): Promise<CustomerUsageRow[]> {
    return this.repo.usageByUser(since, until);
  }

  /**
   * One customer's requests, newest first. A preview carries its picture; a try-on never does
   * (her own photo and the result stay private), only its count and credits.
   */
  async usageJobs(userId: string, since: Date, until: Date, limit: number): Promise<CustomerUsageJob[]> {
    const rows = await this.repo.listByUser(userId, since, until, limit);
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        kind: r.kind,
        designId: r.designId,
        status: r.status,
        // Same rule as the daily limit: failed requests cost nothing, except inaccurate previews.
        credits: r.status !== 'FAILED' || r.inaccurate ? r.credits : 0,
        remakes: r.retries,
        thumbnailUrl: r.kind === 'PREVIEW' ? await this.resultUrl(r) : null,
        createdAt: r.createdAt,
      })),
    );
  }

  private async resultUrl(row: CustomerPreviewRecord): Promise<string | null> {
    return row.status === 'DONE' && row.resultPath ? this.files.signedUrl(row.resultPath, RESULT_URL_TTL_SECONDS) : null;
  }

  /** `leftOut`: what was dropped from the wish of this request (a shared picture may have had none). */
  /** `expiresAt`: when it disappears for the customer asking (her access). */
  private async toDto(row: CustomerPreviewRecord, leftOut?: string[], expiresAt?: Date | null): Promise<CustomerPreviewDto> {
    const choices = (row.choices ?? []) as string[];
    return {
      fromWords: choices.some((c) => c.startsWith(WORDS_LINE)),
      leftOut: leftOut ?? choices.filter((c) => c.startsWith(LEFT_OUT_LINE)).map((c) => c.slice(LEFT_OUT_LINE.length)),
      customised: row.kind === 'TRYON' && (Boolean(row.basePreviewId) || choices.includes(CUSTOM_COLOUR_LINE)),
      id: row.id,
      kind: row.kind,
      designId: row.designId,
      status: row.status,
      imageUrl: await this.resultUrl(row),
      error:
        row.status !== 'FAILED' ? null : row.inaccurate ? (row.kind === 'TRYON' ? INACCURATE_TRYON_MESSAGE : INACCURATE_MESSAGE) : row.error,
      createdAt: row.createdAt.toISOString(),
      expiresAt: (expiresAt ?? null)?.toISOString() ?? null,
    };
  }
}

/** One website request in the FASHN usage report. */
export interface CustomerUsageJob {
  id: string;
  kind: CustomerPreviewKind;
  designId: string;
  status: CustomerPreviewStatus;
  credits: number;
  remakes: number;
  /** null for try-ons, always. */
  thumbnailUrl: string | null;
  createdAt: Date;
}
