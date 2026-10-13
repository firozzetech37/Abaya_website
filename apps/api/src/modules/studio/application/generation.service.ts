import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminDesignDetail,
  type GenerationBody,
  type GenerationDto,
  isPinterestUrl,
  promptProblems,
  type StudioLimitsDto,
} from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import { DesignsAdminService } from '../../catalog/application/designs-admin.service';
import { UploadsService } from '../../media/application/uploads.service';
import { startOfIndiaDay } from '../domain/studio.rules';
import { GenerationWorker } from './generation-worker.service';
import {
  type GenerationRecord,
  IMAGE_GENERATOR,
  type ImageGenerator,
  STUDIO_FILES,
  STUDIO_REPOSITORY,
  type StudioFiles,
  type StudioRepository,
} from './ports/studio.ports';

const isManager = (actor: Actor) => actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('CATALOG_MANAGER');

/**
 * AI Design in the Studio (docs/apps/studio.md): a designer's request passes the prompt filter
 * and the daily limit, then the worker makes the variations. A picked variation becomes a
 * draft design (source AI_GENERATED) that goes through the normal review.
 */
@Injectable()
export class GenerationService {
  constructor(
    @Inject(STUDIO_REPOSITORY) private readonly repo: StudioRepository,
    @Inject(IMAGE_GENERATOR) private readonly generator: ImageGenerator,
    @Inject(STUDIO_FILES) private readonly files: StudioFiles,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'AI_DAILY_LIMIT' | 'AI_IMAGES_PER_GENERATION'>,
    private readonly uploads: UploadsService,
    private readonly designs: DesignsAdminService,
    private readonly worker: GenerationWorker,
  ) {}

  async limits(actor: Actor, now = new Date()): Promise<StudioLimitsDto> {
    return {
      mode: this.generator.live ? 'live' : 'test',
      model: this.generator.model,
      dailyLimit: this.config.AI_DAILY_LIMIT,
      usedToday: await this.repo.countSince(actor.userId, startOfIndiaDay(now)),
      imagesPerGeneration: this.config.AI_IMAGES_PER_GENERATION,
    };
  }

  async create(actor: Actor, body: GenerationBody, now = new Date()): Promise<GenerationDto> {
    const problems = promptProblems(body.prompt);
    if (problems.length > 0) {
      throw new BusinessRuleError(
        'PROMPT_NOT_ALLOWED',
        'Describe your own design: no brand or celebrity names, no copying, no links.',
        { problems },
      );
    }
    if (body.inspirationUrl && !isPinterestUrl(body.inspirationUrl)) {
      throw new BusinessRuleError('INVALID_PIN_URL', 'Inspiration must be a Pinterest pin link.');
    }
    const used = await this.repo.countSince(actor.userId, startOfIndiaDay(now));
    if (used >= this.config.AI_DAILY_LIMIT) {
      throw new BusinessRuleError('DAILY_LIMIT_REACHED', `You have used today's ${this.config.AI_DAILY_LIMIT} AI designs. Try again tomorrow.`, {
        limit: this.config.AI_DAILY_LIMIT,
      });
    }
    if (body.sketchPath) {
      this.uploads.assertPath('DESIGN_SKETCH', body.sketchPath);
      await this.uploads.cleanPhoto(body.sketchPath);
    }
    const { prompt, sketchPath, inspirationUrl, ...choices } = body;
    const options = Object.fromEntries(Object.entries(choices).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as Record<string, string>;
    const generation = await this.repo.create(
      {
        designerId: actor.userId,
        prompt: prompt.trim(),
        options,
        sketchPath: sketchPath ?? null,
        inspirationUrl: inspirationUrl ?? null,
        provider: this.generator.provider,
        model: this.generator.model,
      },
      {
        actorUserId: actor.userId,
        action: 'studio.generation_requested',
        entityType: 'DesignGeneration',
        entityId: '',
        after: { prompt: prompt.trim(), options, model: this.generator.model, inspirationUrl: inspirationUrl ?? null, sketch: Boolean(sketchPath) },
        ip: actor.ip,
      },
    );
    this.worker.kick();
    return this.toDto(generation);
  }

  async list(actor: Actor): Promise<GenerationDto[]> {
    return Promise.all((await this.repo.listForDesigner(actor.userId, 30)).map((g) => this.toDto(g)));
  }

  async get(actor: Actor, id: string): Promise<GenerationDto> {
    return this.toDto(await this.requireOwn(actor, id));
  }

  async favourite(actor: Actor, imageId: string, favourite: boolean): Promise<GenerationDto> {
    const found = await this.requireOwnImage(actor, imageId);
    await this.repo.setFavourite(imageId, favourite);
    return this.get(actor, found.generation.id);
  }

  /**
   * A draft design from one variation: the image is copied into the design's photos and the
   * design keeps a snapshot of the prompt and model for the reviewer.
   */
  async designFromImage(
    actor: Actor,
    imageId: string,
    input: { name: string; style: AdminDesignDetail['style']; description?: string },
  ): Promise<AdminDesignDetail> {
    const { image, generation } = await this.requireOwnImage(actor, imageId);
    if (image.designId) {
      throw new BusinessRuleError('ALREADY_USED', 'A design was already made from this image.', { designId: image.designId });
    }
    const original = await this.files.read(image.storagePath);
    if (!original) throw new NotFoundError('Generated image');
    const created = await this.designs.create(actor, {
      name: input.name,
      style: input.style,
      description: input.description,
      tags: [],
      leadTimeDays: 12,
      source: 'AI_GENERATED',
      inspirationUrl: generation.inspirationUrl ?? undefined,
      aiGeneration: {
        generationId: generation.id,
        prompt: generation.prompt,
        model: generation.model,
        createdAt: generation.createdAt.toISOString(),
      },
    });
    const photoPath = this.uploads.pathFor('DESIGN_IMAGE', contentTypeOf(image.storagePath));
    await this.files.write(photoPath, original, contentTypeOf(image.storagePath));
    const detail = await this.designs.attachImage(actor, created.id, { storagePath: photoPath, isPrimary: true });
    await this.repo.linkDesign(imageId, created.id);
    return detail;
  }

  private async requireOwn(actor: Actor, id: string): Promise<GenerationRecord> {
    const g = await this.repo.findById(id);
    if (!g || (g.designerId !== actor.userId && !isManager(actor))) throw new NotFoundError('Generation');
    return g;
  }

  private async requireOwnImage(actor: Actor, imageId: string) {
    const found = await this.repo.findImage(imageId);
    if (!found || (found.generation.designerId !== actor.userId && !isManager(actor))) throw new NotFoundError('Generated image');
    return found;
  }

  private async toDto(g: GenerationRecord): Promise<GenerationDto> {
    return {
      id: g.id,
      status: g.status,
      prompt: g.prompt,
      options: g.options as GenerationDto['options'],
      sketchUrl: g.sketchPath ? await this.files.signedUrl(g.sketchPath) : null,
      inspirationUrl: g.inspirationUrl,
      provider: g.provider,
      model: g.model,
      mode: g.provider === 'test' ? 'test' : 'live',
      error: g.error,
      createdAt: g.createdAt.toISOString(),
      finishedAt: g.finishedAt?.toISOString() ?? null,
      images: await Promise.all(
        [...g.images]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(async (i) => ({
            id: i.id,
            url: await this.files.signedUrl(i.storagePath),
            favourite: i.favourite,
            designId: i.designId,
          })),
      ),
    };
  }
}

const contentTypeOf = (path: string): 'image/png' | 'image/jpeg' | 'image/webp' =>
  path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
