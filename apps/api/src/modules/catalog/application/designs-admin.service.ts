import { Inject, Injectable } from '@nestjs/common';
import { downloadPriceOf, type OptionGroupCode } from '@abaya/contracts';
import type {
  AdminDesignDetail,
  AdminDesignListItem,
  AiInsightsDto,
  AiMatchLevel,
  ApplyAiSuggestionBody,
  DesignStatus,
  ListAdminDesignsQuery,
  Paginated,
} from '@abaya/contracts';
import type { AuditEntry } from '../../../common/audit/audit';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import { EVENT_PUBLISHER, EVENTS, type EventPublisher } from '../../../common/events/events';
import { type AiSubject, AiService, mergeTags } from '../../ai/application/ai.service';
import { PREVIEW_GENERATION } from '../../media/application/image-cleaner';
import { UploadsService } from '../../media/application/uploads.service';
import { OptionCatalogService } from '../../pricing/application/option-catalog.service';
import { isDesignerOnly } from '../domain/design.entity';
import { toEntity } from './design-entity';
import { ReferenceRules } from '../domain/reference.entity';
import { slugify, uniqueSlug } from '../domain/slug';
import { designImageSource, toInsightsDto } from './ai-assist';
import { allowedActiveValues, requiredGroupsWithoutOptions } from './design-options.view';
import { primaryImage } from './catalog-query.service';
import {
  CATALOG_IMAGE_STORAGE,
  type CatalogImageStorage,
  DESIGN_REPOSITORY,
  type DesignOptionRecord,
  type DesignPatch,
  type DesignRecord,
  type DesignRepository,
  REFERENCE_REPOSITORY,
  type ReferenceRepository,
} from './ports/catalog.ports';

const MAX_IMAGES = 12;
const isPublic = (s: DesignStatus) => s === 'PUBLISHED' || s === 'ARCHIVED';

export interface CreateDesignInput {
  name: string;
  slug?: string;
  description?: string;
  style: DesignRecord['style'];
  tags: string[];
  referenceId?: string;
  leadTimeDays: number;
  inspirationUrl?: string;
  /** Set by the Studio when a design is made from an AI variation. */
  source?: 'UPLOAD' | 'AI_GENERATED';
  aiGeneration?: { generationId: string; prompt: string; model: string; createdAt: string };
}

/** Designer + catalog-manager use cases for designs (docs/domain-model.md §2). */
@Injectable()
export class DesignsAdminService {
  constructor(
    @Inject(DESIGN_REPOSITORY) private readonly designs: DesignRepository,
    @Inject(REFERENCE_REPOSITORY) private readonly references: ReferenceRepository,
    @Inject(CATALOG_IMAGE_STORAGE) private readonly images: CatalogImageStorage,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    private readonly options: OptionCatalogService,
    private readonly uploads: UploadsService,
    private readonly ai: AiService,
  ) {}

  async list(actor: Actor, query: ListAdminDesignsQuery): Promise<Paginated<AdminDesignListItem>> {
    const designerId = isDesignerOnly(actor) || query.mine ? actor.userId : undefined;
    const page = await this.designs.listAdmin({ ...query, designerId });
    const levels = await this.ai.matchLevels(page.items.map((d) => ({ kind: 'DESIGN' as const, id: d.id })));
    const items = await Promise.all(page.items.map((d) => this.toListItem(d, levels.get(`DESIGN:${d.id}`) ?? null)));
    return { items, nextCursor: page.nextCursor };
  }

  async get(actor: Actor, id: string): Promise<AdminDesignDetail> {
    return this.toDetail(actor, await this.requireVisible(actor, id));
  }

  async create(actor: Actor, input: CreateDesignInput): Promise<AdminDesignDetail> {
    if (input.referenceId) {
      const ref = await this.references.findById(input.referenceId);
      if (!ref) throw new NotFoundError('Reference');
      ReferenceRules.assertCanDesignFrom(actor, ref.status, ref.assignedDesigner?.id ?? null);
    }
    const slug = input.slug
      ? await this.assertSlugFree(input.slug)
      : await uniqueSlug(slugify(input.name), (s) => this.designs.slugTaken(s));

    const created = await this.designs.create(
      {
        slug,
        name: input.name,
        description: input.description,
        style: input.style,
        tags: input.tags,
        leadTimeDays: input.leadTimeDays,
        designerId: actor.userId,
        referenceId: input.referenceId,
        source: input.source,
        inspirationUrl: input.inspirationUrl,
        aiGeneration: input.aiGeneration,
      },
      // entityId is filled in by the repository once the row exists.
      { actorUserId: actor.userId, action: 'design.created', entityType: 'Design', entityId: '', after: { slug, name: input.name }, ip: actor.ip },
      input.referenceId,
    );
    return this.toDetail(actor, created);
  }

  /** Studio home: my designs by status, approval time and what needs my attention. */
  async designerSummary(designerId: string) {
    const rows = await this.designs.listForDesigner(designerId);
    const byStatus: Partial<Record<DesignStatus, number>> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const approvals = rows.filter((r) => r.submittedAt && r.approvedAt && r.approvedAt > r.submittedAt);
    const averageApprovalHours =
      approvals.length > 0
        ? Math.round((approvals.reduce((n, r) => n + (r.approvedAt!.getTime() - r.submittedAt!.getTime()), 0) / approvals.length / 3_600_000) * 10) / 10
        : null;
    return {
      byStatus,
      averageApprovalHours,
      needsAttention: rows
        .filter((r) => r.status === 'CHANGES_REQUESTED')
        .slice(0, 10)
        .map((r) => ({ id: r.id, name: r.name, reviewNotes: r.reviewNotes, updatedAt: r.updatedAt.toISOString() })),
      designIds: rows.map((r) => r.id),
    };
  }

  /**
   * Make the web previews again for every live design (e.g. designs published before
   * previews existed). Super admin only; safe to run more than once.
   */
  async rebuildPreviews(): Promise<{ designs: number; images: number }> {
    const live = await this.designs.listPublicImagePaths();
    let images = 0;
    for (const d of live) {
      images += await this.uploads.publishPreviews(d.designId, d.paths);
      await this.designs.bumpPreviewVersions(d.paths, PREVIEW_GENERATION);
    }
    return { designs: live.length, images };
  }

  /**
   * Remake the web previews made by older code (before the invisible watermark), in batches.
   * Runs by itself when the API starts; each photo is done once (its generation goes up).
   */
  async refreshStalePreviews(batch = 50): Promise<number> {
    let done = 0;
    for (;;) {
      const stale = await this.designs.listStalePreviewPaths(batch, PREVIEW_GENERATION);
      if (stale.length === 0) return done;
      const byDesign = new Map<string, string[]>();
      for (const s of stale) byDesign.set(s.designId, [...(byDesign.get(s.designId) ?? []), s.path]);
      for (const [designId, paths] of byDesign) {
        try {
          await this.uploads.publishPreviews(designId, paths);
        } catch {
          // An unreadable photo keeps its old preview; it is marked done so it is not retried forever.
        }
      }
      await this.designs.bumpPreviewVersions(stale.map((s) => s.path), PREVIEW_GENERATION);
      done += stale.length;
    }
  }

  /** For the downloads module: what a customer may buy for a design (published + on sale). */
  async downloadSubject(designId: string): Promise<{
    id: string;
    name: string;
    slug: string;
    style: AdminDesignDetail['style'];
    priceInPaise: number;
    imagePaths: string[];
  } | null> {
    const d = await this.designs.findById(designId);
    if (!d || d.status !== 'PUBLISHED' || !d.downloadEnabled || d.images.length === 0) return null;
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      style: d.style,
      priceInPaise: downloadPriceOf(d),
      imagePaths: [...d.images]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
        .map((i) => i.storagePath),
    };
  }

  /**
   * A published design's photos and the options customers may choose, for the website's AI
   * preview and try-on (null when the design is not live).
   */
  async customisationSubject(designId: string): Promise<{
    id: string;
    name: string;
    slug: string;
    style: AdminDesignDetail['style'];
    images: { storagePath: string; colourValueId: string | null; isPrimary: boolean; sortOrder: number }[];
    options: { id: string; groupCode: OptionGroupCode; name: string; description: string | null; isDefault: boolean }[];
  } | null> {
    const [d, { catalog }] = await Promise.all([this.designs.findById(designId), this.options.displayCatalog()]);
    if (!d || d.status !== 'PUBLISHED' || d.images.length === 0) return null;
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      style: d.style,
      images: [...d.images]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
        .map((i) => ({ storagePath: i.storagePath, colourValueId: i.colourValueId, isPrimary: i.isPrimary, sortOrder: i.sortOrder })),
      options: allowedActiveValues(d, catalog).map((a) => ({
        id: a.value.id,
        groupCode: a.value.groupCode,
        name: a.value.name,
        description: a.value.description,
        isDefault: a.isDefault,
      })),
    };
  }

  /** The design a watermark points at (its id's first 8 hex digits), in any status; null when none. */
  async designByIdPrefix(prefix: string): Promise<{ id: string; name: string; slug: string; status: AdminDesignDetail['status'] } | null> {
    const id = await this.designs.findIdByPrefix(prefix);
    const d = id ? await this.designs.findById(id) : null;
    return d ? { id: d.id, name: d.name, slug: d.slug, status: d.status } : null;
  }

  /** Names of designs in any status, for admin reports (missing ids are left out). */
  async designNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    return new Map((await this.designs.findManyByIds(unique)).map((d) => [d.id, d.name]));
  }

  /** The web preview customers see for a stored design photo. */
  previewUrl(storagePath: string): string {
    return this.images.publicUrl(storagePath);
  }

  async update(actor: Actor, id: string, patch: DesignPatch): Promise<AdminDesignDetail> {
    const design = await this.requireVisible(actor, id);
    const entity = toEntity(design);
    entity.assertCanEditDetails(actor);
    if (
      patch.basePriceInPaise !== undefined ||
      patch.collectionIds !== undefined ||
      patch.downloadEnabled !== undefined ||
      patch.downloadPriceInPaise !== undefined
    ) {
      entity.assertCanEditPricing(actor);
    }
    if (patch.slug && patch.slug !== design.slug) await this.assertSlugFree(patch.slug, id);

    const base = { actorUserId: actor.userId, entityType: 'Design', entityId: id, ip: actor.ip };
    const audit: AuditEntry[] = [];
    if (patch.basePriceInPaise !== undefined && patch.basePriceInPaise !== design.basePriceInPaise) {
      audit.push({
        ...base,
        action: 'design.price_changed',
        before: { basePriceInPaise: design.basePriceInPaise, status: design.status },
        after: { basePriceInPaise: patch.basePriceInPaise },
      });
    }
    const downloadChanged =
      (patch.downloadEnabled !== undefined && patch.downloadEnabled !== design.downloadEnabled) ||
      (patch.downloadPriceInPaise !== undefined && patch.downloadPriceInPaise !== design.downloadPriceInPaise);
    if (downloadChanged) {
      audit.push({
        ...base,
        action: 'design.download_changed',
        before: { downloadEnabled: design.downloadEnabled, downloadPriceInPaise: design.downloadPriceInPaise },
        after: {
          downloadEnabled: patch.downloadEnabled ?? design.downloadEnabled,
          downloadPriceInPaise: patch.downloadPriceInPaise !== undefined ? patch.downloadPriceInPaise : design.downloadPriceInPaise,
        },
      });
    }
    const { basePriceInPaise: _p, downloadEnabled: _e, downloadPriceInPaise: _d, ...rest } = patch;
    const changed = Object.entries(rest).filter(([, v]) => v !== undefined);
    if (changed.length > 0) {
      const before = design as unknown as Record<string, unknown>;
      audit.push({
        ...base,
        action: 'design.updated',
        before: Object.fromEntries(changed.map(([k]) => [k, before[k]])),
        after: Object.fromEntries(changed),
      });
    }
    return this.toDetail(actor, await this.designs.update(id, patch, audit));
  }

  async attachImage(
    actor: Actor,
    id: string,
    input: { storagePath: string; alt?: string; width?: number; height?: number; isPrimary: boolean; colourValueId?: string | null; isDetail?: boolean },
  ): Promise<AdminDesignDetail> {
    const design = await this.requireVisible(actor, id);
    toEntity(design).assertCanEditDetails(actor);
    this.uploads.assertPath('DESIGN_IMAGE', input.storagePath);
    await this.assertColourValues([input.colourValueId]);
    if (design.images.length >= MAX_IMAGES) {
      throw new BusinessRuleError('TOO_MANY_IMAGES', `A design can have up to ${MAX_IMAGES} images.`);
    }
    // Location (EXIF) and other metadata never leave the upload: the photo is re-encoded first.
    const cleaned = await this.uploads.cleanPhoto(input.storagePath);
    // Images added to a live design go public straight away (as a web preview).
    if (isPublic(design.status)) await this.uploads.publishPreviews(id, [input.storagePath]);
    let updated = await this.designs.addImage(id, {
      storagePath: input.storagePath,
      alt: input.alt ?? null,
      width: cleaned?.width ?? input.width ?? null,
      height: cleaned?.height ?? input.height ?? null,
      isPrimary: input.isPrimary || design.images.length === 0,
      colourValueId: input.colourValueId ?? null,
      isDetail: input.isDetail ?? false,
    });
    if (isPublic(design.status)) {
      // Its preview was just made by the current code: mark it so it is not remade at start-up.
      await this.designs.bumpPreviewVersions([input.storagePath], PREVIEW_GENERATION);
      updated = (await this.designs.findById(id)) ?? updated;
    }
    // Tag suggestions and the duplicate check run in the background.
    const added = updated.images.filter((i) => !design.images.some((old) => old.id === i.id));
    await this.ai.enqueue(
      added.map((i) => ({ kind: 'DESIGN_IMAGE' as const, subjectId: i.id, designId: id, source: designImageSource(i.storagePath) })),
    );
    return this.toDetail(actor, updated);
  }

  async updateImages(
    actor: Actor,
    id: string,
    images: { id: string; alt?: string | null; isPrimary: boolean; colourValueId?: string | null; isDetail?: boolean }[],
  ): Promise<AdminDesignDetail> {
    const design = await this.requireVisible(actor, id);
    toEntity(design).assertCanEditDetails(actor);
    const known = new Set(design.images.map((i) => i.id));
    if (images.some((i) => !known.has(i.id))) throw new NotFoundError('Image');
    await this.assertColourValues(images.map((i) => i.colourValueId));
    return this.toDetail(actor, await this.designs.updateImages(id, images));
  }

  async deleteImage(actor: Actor, id: string, imageId: string): Promise<AdminDesignDetail> {
    const design = await this.requireVisible(actor, id);
    toEntity(design).assertCanEditDetails(actor);
    if (design.status === 'PUBLISHED' && design.images.length <= 1) {
      throw new BusinessRuleError('LAST_IMAGE', 'A published design needs at least one image.');
    }
    const removed = await this.designs.deleteImage(id, imageId);
    if (!removed) throw new NotFoundError('Image');
    await this.ai.forget('DESIGN_IMAGE', [imageId]);
    return this.toDetail(actor, (await this.designs.findById(id))!);
  }

  async setOptions(actor: Actor, id: string, input: DesignOptionRecord[]): Promise<AdminDesignDetail> {
    const design = await this.requireVisible(actor, id);
    toEntity(design).assertCanEditPricing(actor);

    const ids = input.map((o) => o.optionValueId);
    if (new Set(ids).size !== ids.length) {
      throw new BusinessRuleError('DUPLICATE_OPTION', 'Each option value may appear only once.');
    }
    const values = await this.options.findValuesByIds(ids);
    if (values.length !== ids.length) throw new NotFoundError('Option value');

    const { groups } = await this.options.getCatalog();
    const valueById = new Map(values.map((v) => [v.id, v]));
    for (const group of groups.filter((g) => g.selectionType === 'SINGLE')) {
      const defaults = input.filter((o) => o.isDefault && valueById.get(o.optionValueId)?.groupCode === group.code);
      if (defaults.length > 1) {
        throw new BusinessRuleError('TOO_MANY_DEFAULTS', `Choose one default for ${group.name}.`);
      }
    }

    const updated = await this.designs.setOptions(id, input, {
      actorUserId: actor.userId,
      action: 'design.options_changed',
      entityType: 'Design',
      entityId: id,
      before: design.options,
      after: input,
      ip: actor.ip,
    });
    return this.toDetail(actor, updated);
  }

  async transition(
    actor: Actor,
    id: string,
    to: DesignStatus,
    notes?: string,
    duplicatesChecked = false,
    originalityConfirmed = false,
  ): Promise<AdminDesignDetail> {
    const design = await this.requireVisible(actor, id);
    // Submitting: whoever submits confirms the design is original (Studio rule, saved with the time).
    const submitting = to === 'IN_REVIEW' && (design.status === 'DRAFT' || design.status === 'CHANGES_REQUESTED');
    if (submitting && !originalityConfirmed) {
      throw new BusinessRuleError('ORIGINALITY_REQUIRED', 'Confirm the design is original before submitting it for review.');
    }
    const entity = toEntity(design);
    const duplicates = design.status === 'IN_REVIEW' && to === 'PRICED' ? await this.likelyDuplicates(design) : [];
    if (duplicates.length > 0 && !duplicatesChecked) {
      throw new BusinessRuleError(
        'DUPLICATE_CHECK_REQUIRED',
        'The AI found a likely duplicate of this design. Compare it with the similar designs, then confirm you checked them.',
        { matches: duplicates },
      );
    }
    const [catalog, sizeBands] = await Promise.all([this.options.getCatalog(), this.options.activeSizeBands()]);

    const from = entity.transition(actor, to, {
      imageCount: design.images.length,
      hasPrimaryImage: design.images.some((i) => i.isPrimary),
      requiredGroupsWithoutOptions: requiredGroupsWithoutOptions(design, catalog),
      activeSizeBandCount: sizeBands.length,
    }, notes);

    // Customers only ever get web previews; originals stay private.
    if (to === 'PUBLISHED') {
      const paths = design.images.map((i) => i.storagePath);
      await this.uploads.publishPreviews(id, paths);
      await this.designs.bumpPreviewVersions(paths, PREVIEW_GENERATION);
    }

    const next = entity.snapshot;
    const saved = await this.designs.saveStatus(
      id,
      {
        status: next.status,
        reviewNotes: next.reviewNotes,
        publishedAt: next.publishedAt,
        archivedAt: next.archivedAt,
        ...(submitting ? { submittedAt: new Date(), originalityConfirmedAt: new Date() } : {}),
        ...(from === 'IN_REVIEW' && to === 'PRICED' ? { approvedAt: new Date() } : {}),
      },
      {
        actorUserId: actor.userId,
        action: 'design.status_changed',
        entityType: 'Design',
        entityId: id,
        before: { status: from },
        after: {
          status: to,
          notes: notes ?? null,
          ...(submitting ? { originalityConfirmed: true } : {}),
          // The reviewer confirmed they compared these look-alikes before approving.
          ...(duplicates.length > 0 ? { duplicatesAcknowledged: duplicates } : {}),
        },
        ip: actor.ip,
      },
    );
    if (to === 'PUBLISHED') await this.events.publish(EVENTS.DesignPublished, { designId: id, slug: saved.slug });
    return this.toDetail(actor, saved);
  }

  async aiInsights(actor: Actor, id: string): Promise<AiInsightsDto> {
    const design = await this.requireVisible(actor, id);
    const insights = await this.ai.insights(this.aiSubject(design));
    return toInsightsDto(actor, insights, { designs: this.designs, references: this.references, images: this.images }, design.referenceId);
  }

  /** Accept AI suggestions: tags are added (never removed), style and missing alt texts filled in. */
  async applyAi(actor: Actor, id: string, body: ApplyAiSuggestionBody): Promise<AdminDesignDetail> {
    const design = await this.requireVisible(actor, id);
    toEntity(design).assertCanEditDetails(actor);
    const tags = mergeTags(design.tags, body.tags);
    const patch = {
      ...(tags.length !== design.tags.length ? { tags } : {}),
      ...(body.style && body.style !== design.style ? { style: body.style } : {}),
    };
    if (Object.keys(patch).length > 0) await this.update(actor, id, patch);
    if (body.altText && design.images.some((i) => !i.alt)) {
      await this.designs.updateImages(
        id,
        design.images.map((i) => ({ id: i.id, alt: i.alt ?? body.altText, isPrimary: i.isPrimary })),
      );
    }
    await this.ai.markSuggestions('DESIGN_IMAGE', design.images.map((i) => i.id), 'APPLIED');
    return this.get(actor, id);
  }

  async dismissAi(actor: Actor, id: string): Promise<void> {
    const design = await this.requireVisible(actor, id);
    toEntity(design).assertCanEditDetails(actor);
    await this.ai.markSuggestions('DESIGN_IMAGE', design.images.map((i) => i.id), 'DISMISSED');
  }

  /** Everything the AI assistant should know about: runs at startup (see CatalogAiSync). */
  async listImagesForAi() {
    const images = await this.designs.listAllImages();
    return images.map((i) => ({ kind: 'DESIGN_IMAGE' as const, subjectId: i.id, designId: i.designId, source: designImageSource(i.storagePath) }));
  }

  private aiSubject(d: DesignRecord): AiSubject {
    return { kind: 'DESIGN', designId: d.id, images: d.images.map((i) => ({ id: i.id, isPrimary: i.isPrimary })), tags: d.tags, style: d.style };
  }

  private async likelyDuplicates(d: DesignRecord) {
    if (!this.ai.enabled) return [];
    const { matches } = await this.ai.insights(this.aiSubject(d));
    return matches
      .filter((m) => m.level === 'DUPLICATE')
      .map((m) => ({ kind: m.owner.kind, id: m.owner.id, score: m.score }));
  }

  countAwaitingReview(): Promise<number> {
    return this.designs.countByStatus('IN_REVIEW');
  }

  /** The design's primary photo (private original path), for the AI Catalog; null when it has none. */
  async primaryImagePath(actor: Actor, id: string): Promise<{ storagePath: string } | null> {
    const design = await this.requireVisible(actor, id);
    const image = primaryImage(design);
    return image ? { storagePath: image.storagePath } : null;
  }

  private async requireVisible(actor: Actor, id: string): Promise<DesignRecord> {
    const design = await this.designs.findById(id);
    if (!design || !toEntity(design).canView(actor)) throw new NotFoundError('Design');
    return design;
  }

  private async assertSlugFree(slug: string, exceptId?: string): Promise<string> {
    if (await this.designs.slugTaken(slug, exceptId)) {
      throw new BusinessRuleError('SLUG_TAKEN', 'Another design already uses this URL.');
    }
    return slug;
  }

  private async toListItem(d: DesignRecord, aiMatch: AiMatchLevel | null): Promise<AdminDesignListItem> {
    const image = primaryImage(d);
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      style: d.style,
      status: d.status,
      basePriceInPaise: d.basePriceInPaise,
      designer: d.designer,
      primaryImageUrl: image ? await this.images.adminUrl(image.storagePath) : null,
      updatedAt: d.updatedAt.toISOString(),
      aiMatch,
      source: d.source,
    };
  }

  /** Photos may only be tagged with an active colour from the option catalog (read fresh, not cached). */
  async assertColourValues(ids: (string | null | undefined)[]): Promise<void> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (wanted.length === 0) return;
    const catalog = await this.options.getCatalog();
    const colours = new Set(catalog.values.filter((v) => v.groupCode === 'COLOUR' && v.isActive).map((v) => v.id));
    const unknown = wanted.find((id) => !colours.has(id));
    if (unknown) {
      throw new BusinessRuleError('UNKNOWN_COLOUR', 'Photos can only be tagged with an active colour option.', { colourValueId: unknown });
    }
  }

  private async toDetail(actor: Actor, d: DesignRecord): Promise<AdminDesignDetail> {
    const entity = toEntity(d);
    // Image links and the AI match level are fetched at the same time, not one after another.
    const [images, levels] = await Promise.all([
      Promise.all(
        [...d.images]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(async (i) => ({
            id: i.id,
            storagePath: i.storagePath,
            url: await this.images.adminUrl(i.storagePath),
            alt: i.alt,
            isPrimary: i.isPrimary,
            sortOrder: i.sortOrder,
            colourValueId: i.colourValueId,
            isDetail: i.isDetail,
          })),
      ),
      this.ai.matchLevels([{ kind: 'DESIGN', id: d.id }]),
    ]);
    return {
      ...(await this.toListItem(d, levels.get(`DESIGN:${d.id}`) ?? null)),
      originalityConfirmedAt: d.originalityConfirmedAt?.toISOString() ?? null,
      inspirationUrl: d.inspirationUrl,
      aiGeneration: (d.aiGeneration as AdminDesignDetail['aiGeneration']) ?? null,
      submittedAt: d.submittedAt?.toISOString() ?? null,
      approvedAt: d.approvedAt?.toISOString() ?? null,
      downloadEnabled: d.downloadEnabled,
      downloadPriceInPaise: d.downloadPriceInPaise,
      description: d.description,
      tags: d.tags,
      makingCostInPaise: d.makingCostInPaise,
      leadTimeDays: d.leadTimeDays,
      reviewNotes: d.reviewNotes,
      referenceId: d.referenceId,
      collectionIds: d.collectionIds,
      images,
      options: d.options,
      publishedAt: d.publishedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      allowedTransitions: entity.canView(actor) ? entity.allowedTransitionsFor(actor) : [],
    };
  }
}

