import { Inject, Injectable } from '@nestjs/common';
import type { AiInsightsDto, AiMatchLevel, ApplyAiSuggestionBody, Paginated, ReferenceDto, ReferenceStatus } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import { AiService, mergeTags } from '../../ai/application/ai.service';
import { IdentityService } from '../../identity/application/identity.service';
import { UploadsService } from '../../media/application/uploads.service';
import { ReferenceRules } from '../domain/reference.entity';
import { referenceImageSource, toInsightsDto } from './ai-assist';
import {
  CATALOG_IMAGE_STORAGE,
  type CatalogImageStorage,
  DESIGN_REPOSITORY,
  type DesignRepository,
  REFERENCE_REPOSITORY,
  type ReferenceRecord,
  type ReferenceRepository,
} from './ports/catalog.ports';

export interface ReferencePatch {
  title?: string;
  tags?: string[];
  licenseNote?: string;
  status?: ReferenceStatus;
  reviewNotes?: string;
  assignedDesignerId?: string | null;
}

/**
 * Inspiration images (manual uploads in Phase 1; Pinterest/API imports in Phase 2).
 * Never shown to customers; a designer turns one into an original Design.
 */
@Injectable()
export class ReferencesService {
  constructor(
    @Inject(REFERENCE_REPOSITORY) private readonly references: ReferenceRepository,
    @Inject(CATALOG_IMAGE_STORAGE) private readonly images: CatalogImageStorage,
    private readonly uploads: UploadsService,
    private readonly identity: IdentityService,
    private readonly ai: AiService,
    @Inject(DESIGN_REPOSITORY) private readonly designs: DesignRepository,
  ) {}

  async list(
    actor: Actor,
    query: { status?: ReferenceStatus; cursor?: string; limit: number },
  ): Promise<Paginated<ReferenceDto>> {
    const managerView = ReferenceRules.canView(actor, null);
    const page = await this.references.list({
      ...query,
      assignedDesignerId: managerView ? undefined : actor.userId,
    });
    const levels = await this.ai.matchLevels(page.items.map((r) => ({ kind: 'REFERENCE' as const, id: r.id })));
    return {
      items: await Promise.all(page.items.map((r) => this.toDto(r, levels.get(`REFERENCE:${r.id}`) ?? null))),
      nextCursor: page.nextCursor,
    };
  }

  async get(actor: Actor, id: string): Promise<ReferenceDto> {
    const ref = await this.references.findById(id);
    if (!ref || !ReferenceRules.canView(actor, ref.assignedDesigner?.id ?? null)) throw new NotFoundError('Reference');
    return this.toDto(ref, await this.matchLevel(ref.id));
  }

  async aiInsights(actor: Actor, id: string): Promise<AiInsightsDto> {
    const ref = await this.references.findById(id);
    if (!ref || !ReferenceRules.canView(actor, ref.assignedDesigner?.id ?? null)) throw new NotFoundError('Reference');
    const insights = await this.ai.insights({ kind: 'REFERENCE', referenceId: id, tags: ref.tags });
    return toInsightsDto(actor, insights, { designs: this.designs, references: this.references, images: this.images }, null);
  }

  /** Accept suggested tags for a reference (style and alt text only apply to designs). */
  async applyAi(actor: Actor, id: string, body: ApplyAiSuggestionBody): Promise<ReferenceDto> {
    const ref = await this.references.findById(id);
    if (!ref) throw new NotFoundError('Reference');
    const tags = mergeTags(ref.tags, body.tags);
    const result = tags.length !== ref.tags.length ? await this.update(actor, id, { tags }) : await this.toDto(ref, await this.matchLevel(id));
    await this.ai.markSuggestions('REFERENCE', [id], 'APPLIED');
    return result;
  }

  async dismissAi(id: string): Promise<void> {
    if (!(await this.references.findById(id))) throw new NotFoundError('Reference');
    await this.ai.markSuggestions('REFERENCE', [id], 'DISMISSED');
  }

  async listImagesForAi() {
    const refs = await this.references.listAllImages();
    return refs.map((r) => ({ kind: 'REFERENCE' as const, subjectId: r.id, designId: null, source: referenceImageSource(r.imagePath) }));
  }

  private async matchLevel(id: string): Promise<AiMatchLevel | null> {
    return (await this.ai.matchLevels([{ kind: 'REFERENCE', id }])).get(`REFERENCE:${id}`) ?? null;
  }

  async create(input: {
    imagePath: string;
    title?: string;
    sourceUrl?: string;
    licenseNote?: string;
    tags: string[];
  }): Promise<ReferenceDto> {
    this.uploads.assertPath('REFERENCE_IMAGE', input.imagePath);
    const ref = await this.references.createManual(input);
    await this.ai.enqueue([{ kind: 'REFERENCE', subjectId: ref.id, designId: null, source: referenceImageSource(ref.imagePath) }]);
    return this.toDto(ref, null);
  }

  /** Studio: save a Pinterest pin for ideas (link + Pinterest image address only, no AI analysis). */
  async savePin(actor: Actor, pin: { pinId: string; url: string; imageUrl: string; title: string | null; note: string | null }): Promise<ReferenceDto> {
    const ref = await this.references.savePin({ ...pin, designerId: actor.userId });
    return this.toDto(ref, null);
  }

  /** References waiting for this designer to design from. */
  async countWaitingFor(designerId: string): Promise<number> {
    const page = await this.references.list({ status: 'NEEDS_DESIGN', assignedDesignerId: designerId, limit: 100 });
    return page.items.length;
  }

  async update(actor: Actor, id: string, patch: ReferencePatch): Promise<ReferenceDto> {
    const ref = await this.references.findById(id);
    if (!ref) throw new NotFoundError('Reference');

    const assignee = patch.assignedDesignerId !== undefined ? patch.assignedDesignerId : (ref.assignedDesigner?.id ?? null);
    if (patch.assignedDesignerId && !(await this.identity.hasRole(patch.assignedDesignerId, 'DESIGNER'))) {
      throw new BusinessRuleError('NOT_A_DESIGNER', 'References can only be assigned to designers.');
    }
    if (patch.status && patch.status !== ref.status) {
      ReferenceRules.assertManualTransition(actor, ref.status, patch.status, assignee);
    }

    const updated = await this.references.update(id, patch, {
      actorUserId: actor.userId,
      action: 'reference.updated',
      entityType: 'Reference',
      entityId: id,
      before: { status: ref.status, assignedDesignerId: ref.assignedDesigner?.id ?? null },
      after: patch,
      ip: actor.ip,
    });
    return this.toDto(updated, await this.matchLevel(id));
  }

  private async toDto(r: ReferenceRecord, aiMatch: AiMatchLevel | null): Promise<ReferenceDto> {
    return {
      id: r.id,
      source: r.source,
      sourceUrl: r.sourceUrl,
      imageUrl: await this.images.referenceUrl(r.imagePath),
      title: r.title,
      tags: r.tags,
      licenseNote: r.licenseNote,
      status: r.status,
      reviewNotes: r.reviewNotes,
      assignedDesigner: r.assignedDesigner,
      designIds: r.designIds,
      importedAt: r.importedAt.toISOString(),
      aiMatch,
    };
  }
}
