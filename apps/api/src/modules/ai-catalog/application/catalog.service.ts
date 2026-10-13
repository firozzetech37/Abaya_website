import { Inject, Injectable } from '@nestjs/common';
import {
  type AbayaStyle,
  type Paginated,
  type AddCatalogSetResponse,
  type AdminDesignDetail,
  BACK_CONSTRUCTION_UNVERIFIED,
  buildEditPrompt,
  buildMasterPrompt,
  buildOneStepPrompt,
  buildModelPrompt,
  buildPosePrompt,
  CATALOG_PRESETS,
  type CatalogEditType,
  type CatalogImageDto,
  type CatalogJobDto,
  type CatalogLimitsDto,
  type CatalogModelProfileDto,
  type CatalogPose,
  type CatalogPromptPresetDto,
  type CatalogRejectReason,
  classifyEdit,
  type createAiModelBody,
  type createCleanupBody,
  type createEditBody,
  type createMasterBody,
  type createOneStepBody,
  type createPersonalModelBody,
  type createPosesBody,
  type createReframeBody,
  creditCost,
  type DescribeReferenceResponse,
  type DesignReferenceType,
  orderReferences,
  photoshootShots,
  referenceEdit,
  tidy,
  type EmbroideryPlacement,
  FASHN_ENDPOINTS,
  MAX_CATALOG_RETRIES,
  overallScore,
  retryPrompt,
  type reviewCatalogImageBody,
  designEditBody,
  designPhotoshootBody,
  designReframeBody,
} from '@abaya/contracts';
import type { z } from 'zod';
import type { Actor } from '../../../common/auth/auth.types';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import { DesignsAdminService } from '../../catalog/application/designs-admin.service';
import { UploadsService } from '../../media/application/uploads.service';
import { describeInstruction, stageLabel, startOfIndiaDay } from '../domain/catalog.rules';
import {
  CATALOG_FILES,
  CATALOG_REPOSITORY,
  type CatalogFiles,
  type CatalogImageRecord,
  type CatalogJobRecord,
  type CatalogModelProfileRecord,
  type CatalogPromptPresetRecord,
  type CatalogRepository,
  FASHN_CLIENT,
  type FashnClient,
  IMAGE_DESCRIBER,
  type ImageDescriber,
  type NewCatalogJob,
  type StudioUsageRow,
} from './ports/catalog.ports';

const isManager = (a: Actor) =>
  a.roles.includes('SUPER_ADMIN') || a.roles.includes('CATALOG_MANAGER');
const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

/**
 * AI Catalog (docs/apps/studio.md "AI Catalog"): FASHN catalog photos of an abaya. The abaya
 * photo controls the garment; the approved master controls model, styling and background, and
 * every pose and edit is made from it. Every request, prompt, setting and verdict is kept.
 */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(FASHN_CLIENT) private readonly fashn: FashnClient,
    @Inject(CATALOG_FILES) private readonly files: CatalogFiles,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'FASHN_DAILY_CREDIT_LIMIT'>,
    @Inject(IMAGE_DESCRIBER) private readonly describer: ImageDescriber,
    private readonly uploads: UploadsService,
    private readonly designs: DesignsAdminService,
  ) {}

  async limits(actor: Actor, now = new Date()): Promise<CatalogLimitsDto> {
    return {
      mode: this.fashn.live ? 'live' : 'test',
      balance: this.fashn.live ? await this.fashn.credits() : null,
      usedToday: await this.repo.creditsSince(actor.userId, startOfIndiaDay(now)),
      dailyLimit: this.config.FASHN_DAILY_CREDIT_LIMIT,
    };
  }

  // ───────────── Models ─────────────

  /** model-create: options to pick from; the chosen one is saved as a profile. */
  async createAiModel(
    actor: Actor,
    body: z.infer<typeof createAiModelBody>,
  ): Promise<CatalogJobDto> {
    const prompt =
      body.prompt ?? buildModelPrompt(body.attributes, body.backgroundId, body.direction);
    const [job] = await this.queue(actor, [
      this.newJob(actor, {
        kind: 'MODEL_CREATE',
        view: 'MODEL',
        prompt,
        inputs: {
          attributes: body.attributes,
          backgroundId: body.backgroundId,
          direction: body.direction,
        },
        settings: body,
        aspectRatio: '4:5',
      }),
    ]);
    return this.toJobDto(job!);
  }

  async createPersonalModel(
    actor: Actor,
    body: z.infer<typeof createPersonalModelBody>,
  ): Promise<CatalogModelProfileDto> {
    this.uploads.assertPath('CATALOG_INPUT', body.imagePath);
    await this.uploads.cleanPhoto(body.imagePath);
    const profile = await this.repo.createProfile(
      {
        name: body.name,
        type: 'PERSONAL',
        imagePath: body.imagePath,
        description: null,
        createdById: actor.userId,
        consentAt: new Date(),
      },
      this.audit(actor, 'catalog.model_created', 'CatalogModelProfile', {
        type: 'PERSONAL',
        name: body.name,
        consent: true,
      }),
    );
    return this.toProfileDto(profile);
  }

  /** Keep a generated model as "Model 00N" for every later abaya. */
  async saveModelFromImage(
    actor: Actor,
    imageId: string,
    name?: string,
  ): Promise<CatalogModelProfileDto> {
    const { image, job } = await this.requireImage(actor, imageId);
    if (job.view !== 'MODEL')
      throw new BusinessRuleError(
        'NOT_A_MODEL',
        'Only generated model images can be saved as models.',
      );
    const label = name ?? `Model ${String((await this.repo.countProfiles()) + 1).padStart(3, '0')}`;
    const attributes = job.inputs.attributes as Record<string, string | number> | undefined;
    const profile = await this.repo.createProfile(
      {
        name: label,
        type: 'AI',
        imagePath: image.storagePath,
        description: attributes ? describe(attributes) : null,
        createdById: actor.userId,
        attributes,
      },
      this.audit(actor, 'catalog.model_created', 'CatalogModelProfile', {
        type: 'AI',
        name: label,
        imageId,
      }),
    );
    if (image.review === 'PENDING') {
      await this.repo.reviewImage(
        image.id,
        {
          review: 'APPROVED',
          reasons: [],
          scores: image.scores,
          note: image.note,
          reviewedById: actor.userId,
        },
        this.audit(
          actor,
          'catalog.image_reviewed',
          'CatalogImage',
          { review: 'APPROVED', savedAsModel: true },
          image.id,
        ),
      );
    }
    return this.toProfileDto(profile);
  }

  async listModels(): Promise<CatalogModelProfileDto[]> {
    return Promise.all((await this.repo.listProfiles()).map((p) => this.toProfileDto(p)));
  }

  async archiveModel(actor: Actor, id: string): Promise<void> {
    const profile = await this.repo.findProfile(id);
    if (!profile || profile.archivedAt) throw new NotFoundError('Model');
    if (profile.createdBy.id !== actor.userId && !isManager(actor))
      throw new NotFoundError('Model');
    await this.repo.archiveProfile(id);
  }

  // ───────────── Prompt presets ─────────────

  async listPresets(): Promise<CatalogPromptPresetDto[]> {
    return (await this.repo.listPresets()).map(toPresetDto);
  }

  async createPreset(
    actor: Actor,
    body: { name: string; text: string },
  ): Promise<CatalogPromptPresetDto> {
    return toPresetDto(await this.repo.createPreset({ ...body, createdById: actor.userId }));
  }

  async archivePreset(actor: Actor, id: string): Promise<void> {
    const preset = await this.repo.findPreset(id);
    if (!preset || preset.archivedAt || (preset.createdBy.id !== actor.userId && !isManager(actor)))
      throw new NotFoundError('Preset');
    await this.repo.archivePreset(id);
  }

  // ───────────── Master, poses, edits ─────────────

  /**
   * product-to-model, one step: a new model (a new face for every abaya, in a shayla) wearing
   * the abaya in the chosen setting. A face photo (personal model, with consent) or the
   * designer's own background photo can guide it.
   */
  async createOneStep(
    actor: Actor,
    body: z.infer<typeof createOneStepBody>,
  ): Promise<CatalogJobDto> {
    const abayaPath = await this.abayaPhoto(actor, body);
    for (const path of [
      body.backPath,
      body.facePath,
      body.backgroundPath,
      ...body.references.map((r) => r.path),
    ]) {
      if (!path) continue;
      this.uploads.assertPath('CATALOG_INPUT', path);
      await this.uploads.cleanPhoto(path);
    }
    const prompt =
      body.prompt ??
      buildOneStepPrompt({
        attributes: body.attributes,
        backgroundId: body.backgroundId,
        hasBackgroundPhoto: Boolean(body.backgroundPath),
        hasFacePhoto: Boolean(body.facePath),
        garmentDescription: body.garmentDescription,
        style: body.style,
        embroidery: body.embroidery,
        direction: body.direction,
        sketch: body.sketch,
        references: body.references,
        styling: body.styling,
      });
    const master = this.newJob(actor, {
      kind: 'PRODUCT_TO_MODEL',
      view: 'MASTER',
      prompt,
      inputs: {
        abayaPath,
        backPath: body.backPath,
        facePath: body.facePath,
        faceConsent: body.facePath ? true : undefined,
        backgroundPath: body.backgroundPath,
        backgroundId: body.backgroundPath ? undefined : body.backgroundId,
        attributes: body.attributes,
        garmentDescription: body.garmentDescription,
        style: body.style,
        embroidery: body.embroidery,
        direction: body.direction,
        sketch: body.sketch || undefined,
        references: body.references.length ? body.references : undefined,
        styling: body.styling,
      },
      // "Images" is a photoshoot: one full-body master, then the other shots made from it.
      settings: { ...body, numImages: 1 },
      aspectRatio: '4:5',
    });
    const [job] = await this.queue(actor, this.withSteps(actor, master, body));
    return this.toJobDto(job!);
  }

  /**
   * The master, then the reference edits (one after another), then the photoshoot shots
   * (close-up, left, right), each made from the final image of the master and its references.
   */
  private withSteps(
    actor: Actor,
    master: NewCatalogJob,
    body: Parameters<CatalogService['referenceSteps']>[2] & { numImages: number; direction?: string },
  ): NewCatalogJob[] {
    const refs = this.referenceSteps(actor, master, body);
    const baseIndex = refs.length; // the master is 0, the last reference step is refs.length
    const shots = photoshootShots(body.numImages).map((pose) => ({
      ...this.newJob(actor, {
        kind: 'EDIT',
        view: pose,
        prompt: buildPosePrompt(pose, false, {
          style: master.inputs.style as AbayaStyle | undefined,
          embroidery: master.inputs.embroidery as EmbroideryPlacement[] | undefined,
          direction: body.direction,
        }),
        modelProfileId: master.modelProfileId,
        inputs: { ...master.inputs, facePath: undefined, backgroundPath: undefined, maskPath: undefined, contextPath: undefined },
        settings: { resolution: master.resolution, mode: master.mode, numImages: 1, seed: master.seed },
      }),
      afterIndex: baseIndex,
    }));
    return [master, ...refs, ...shots];
  }

  /**
   * "Apply references automatically": after the master, one design edit per reference photo
   * (base fabric, then print, then details), each starting from the image the step before made.
   */
  private referenceSteps(
    actor: Actor,
    master: NewCatalogJob,
    body: {
      applyReferences: boolean;
      references: { type: DesignReferenceType; path: string; note?: string }[];
    } & {
      resolution: NewCatalogJob['resolution'];
      mode: NewCatalogJob['mode'];
      seed?: number;
    },
  ): NewCatalogJob[] {
    if (!body.applyReferences) return [];
    return orderReferences(body.references).map((ref) => {
      const edit = referenceEdit(ref);
      return {
        ...this.newJob(actor, {
          kind: 'EDIT',
          view: 'EDIT',
          prompt: buildEditPrompt(edit.editType, edit.instruction),
          editType: edit.editType,
          instruction: edit.instruction,
          // The master's design facts (style, embroidery, back photo…) stay with every step.
          modelProfileId: master.modelProfileId,
          inputs: {
            ...master.inputs,
            contextPath: ref.path,
            facePath: undefined,
            backgroundPath: undefined,
            maskPath: undefined,
          },
          settings: { resolution: body.resolution, mode: body.mode, numImages: 1, seed: body.seed },
        }),
        afterPrevious: true,
      };
    });
  }

  /** A few words describing a reference photo (Gemini; free key), to fill its note. */
  async describeReference(
    actor: Actor,
    body: { type: DesignReferenceType; path: string },
  ): Promise<DescribeReferenceResponse> {
    this.uploads.assertPath('CATALOG_INPUT', body.path);
    if (!this.describer.available) return { description: null, available: false };
    const data = await this.files.read(body.path);
    if (!data) throw new NotFoundError('Image');
    const mimeType = body.path.endsWith('.png')
      ? 'image/png'
      : body.path.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    const text = await this.describer.describe({ data, mimeType }, describeInstruction(body.type));
    const description = text
      ? tidy(text.replace(/^["'“]|["'”]$/g, '')).slice(0, 200) || null
      : null;
    return { description, available: true };
  }

  /** An uploaded abaya photo, or one cleaned with background-remove. */
  private async abayaPhoto(
    actor: Actor,
    body: { abayaPath?: string; abayaImageId?: string },
  ): Promise<string> {
    if (body.abayaImageId) {
      const { image, job } = await this.requireImage(actor, body.abayaImageId);
      if (job.view !== 'CLEANUP')
        throw new BusinessRuleError(
          'NOT_A_PRODUCT_PHOTO',
          'Use an uploaded or cleaned abaya photo.',
        );
      return image.storagePath;
    }
    const path = body.abayaPath!;
    this.uploads.assertPath('CATALOG_INPUT', path);
    // Location data never leaves our storage: photos are re-encoded first.
    await this.uploads.cleanPhoto(path);
    return path;
  }

  /** tryon-max: the abaya photo onto a saved model (face, pose and background come from the model). */
  async createMaster(actor: Actor, body: z.infer<typeof createMasterBody>): Promise<CatalogJobDto> {
    const abayaPath = await this.abayaPhoto(actor, body);
    if (body.backPath) this.uploads.assertPath('CATALOG_INPUT', body.backPath);
    const profile = await this.repo.findProfile(body.modelProfileId);
    if (!profile || profile.archivedAt) throw new NotFoundError('Model');
    if (body.backPath) await this.uploads.cleanPhoto(body.backPath);
    for (const ref of body.references) {
      this.uploads.assertPath('CATALOG_INPUT', ref.path);
      await this.uploads.cleanPhoto(ref.path);
    }
    const master = this.newJob(actor, {
      kind: 'TRYON',
      view: 'MASTER',
      prompt:
        body.prompt ??
        buildMasterPrompt(body.garmentDescription, body.direction, {
          sketch: body.sketch,
          references: body.references,
          styling: body.styling,
        }),
      modelProfileId: profile.id,
      inputs: {
        abayaPath,
        backPath: body.backPath,
        modelPath: profile.imagePath,
        garmentDescription: body.garmentDescription,
        style: body.style,
        embroidery: body.embroidery,
        direction: body.direction,
        sketch: body.sketch || undefined,
        references: body.references.length ? body.references : undefined,
        styling: body.styling,
      },
      settings: { ...body, numImages: 1 },
    });
    const [job] = await this.queue(actor, this.withSteps(actor, master, body));
    return this.toJobDto(job!);
  }

  // ───────────── From a design's Images tab ("Make with AI") ─────────────

  /**
   * The design's primary photo as a catalog input: the private original is copied to an input
   * path (never the public web preview), so the FASHN jobs see the full picture. The caller must
   * be able to see the design (designer: own designs; catalog manager: all).
   */
  private async designPhoto(actor: Actor, designId: string): Promise<string> {
    const photo = await this.designs.primaryImagePath(actor, designId);
    if (!photo) throw new BusinessRuleError('NO_PHOTO', 'Add a photo to the design first: the AI works from it.');
    const data = await this.files.read(photo.storagePath);
    if (!data) throw new NotFoundError('Image');
    const type = photo.storagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const path = this.uploads.pathFor('CATALOG_INPUT', type);
    await this.files.write(path, data, type);
    return path;
  }

  /** The primary photo on a saved model (a master photoshoot), remembered against the design. */
  async createDesignPhotoshoot(actor: Actor, designId: string, body: z.infer<typeof designPhotoshootBody>): Promise<CatalogJobDto> {
    const abayaPath = await this.designPhoto(actor, designId);
    const profile = await this.repo.findProfile(body.modelProfileId);
    if (!profile || profile.archivedAt) throw new NotFoundError('Model');
    for (const ref of body.references) {
      this.uploads.assertPath('CATALOG_INPUT', ref.path);
      await this.uploads.cleanPhoto(ref.path);
    }
    const master = this.newJob(actor, {
      kind: 'TRYON',
      view: 'MASTER',
      designId,
      prompt:
        body.prompt ??
        buildMasterPrompt(body.garmentDescription, body.direction, { sketch: body.sketch, references: body.references, styling: body.styling }),
      modelProfileId: profile.id,
      inputs: {
        abayaPath,
        modelPath: profile.imagePath,
        garmentDescription: body.garmentDescription,
        style: body.style,
        embroidery: body.embroidery,
        direction: body.direction,
        sketch: body.sketch || undefined,
        references: body.references.length ? body.references : undefined,
        styling: body.styling,
      },
      settings: { ...body, numImages: 1 },
    });
    const steps = this.withSteps(actor, master, body).map((j) => ({ ...j, designId }));
    const [job] = await this.queue(actor, steps);
    return this.toJobDto(job!);
  }

  /** One described change to the primary photo. */
  async createDesignEdit(actor: Actor, designId: string, body: z.infer<typeof designEditBody>): Promise<CatalogJobDto> {
    const sourcePath = await this.designPhoto(actor, designId);
    if (body.maskPath) this.uploads.assertPath('CATALOG_INPUT', body.maskPath);
    if (body.contextPath) {
      this.uploads.assertPath('CATALOG_INPUT', body.contextPath);
      await this.uploads.cleanPhoto(body.contextPath);
    }
    const editType: CatalogEditType = body.editType ?? classifyEdit(body.instruction);
    const [created] = await this.queue(actor, [
      this.newJob(actor, {
        kind: 'EDIT',
        view: 'EDIT',
        designId,
        prompt: body.prompt ?? buildEditPrompt(editType, body.instruction),
        editType,
        instruction: body.instruction,
        inputs: { sourcePath, maskPath: body.maskPath, contextPath: body.contextPath },
        settings: body,
      }),
    ]);
    return this.toJobDto(created!);
  }

  /** The primary photo in another shape, e.g. landscape for the website's hero card. */
  async createDesignReframe(actor: Actor, designId: string, body: z.infer<typeof designReframeBody>): Promise<CatalogJobDto> {
    const sourcePath = await this.designPhoto(actor, designId);
    const [created] = await this.queue(actor, [
      this.newJob(actor, {
        kind: 'REFRAME',
        view: 'REFRAME',
        designId,
        prompt: `Reframe to ${body.aspectRatio}`,
        inputs: { sourcePath },
        settings: { resolution: body.resolution, mode: body.mode, numImages: 1 },
        aspectRatio: body.aspectRatio,
      }),
    ]);
    return this.toJobDto(created!);
  }

  /** Poses from the approved master only (edit), so the model, garment and background stay the same. */
  async createPoses(
    actor: Actor,
    imageId: string,
    body: z.infer<typeof createPosesBody>,
  ): Promise<CatalogJobDto[]> {
    const { image, job } = await this.requireImage(actor, imageId);
    // From the master, or an edit of it (e.g. after the references were applied).
    if (job.view !== 'MASTER' && job.view !== 'EDIT')
      throw new BusinessRuleError('NOT_A_MASTER', 'Poses are made from a master image.');
    if (image.review !== 'APPROVED')
      throw new BusinessRuleError('MASTER_NOT_APPROVED', 'Approve the master image first.');
    if (body.backPath) {
      this.uploads.assertPath('CATALOG_INPUT', body.backPath);
      await this.uploads.cleanPhoto(body.backPath);
    }
    const backPath = body.backPath ?? job.inputs.backPath;
    const poses = [...new Set(body.poses)] as CatalogPose[];
    const jobs = await this.queue(
      actor,
      poses.map((pose) =>
        this.newJob(actor, {
          kind: 'EDIT',
          view: pose,
          prompt: buildPosePrompt(pose, Boolean(backPath), {
            style: job.inputs.style as AbayaStyle | undefined,
            embroidery: job.inputs.embroidery as EmbroideryPlacement[] | undefined,
            direction: body.direction,
          }),
          modelProfileId: job.modelProfileId,
          parentImageId: image.id,
          inputs: {
            ...job.inputs,
            sourcePath: image.storagePath,
            backPath: pose === 'BACK' ? backPath : undefined,
            maskPath: undefined,
            contextPath: undefined,
            facePath: undefined,
            backgroundPath: undefined,
          },
          settings: { resolution: body.resolution, mode: body.mode, numImages: 1, seed: job.seed },
          flags: pose === 'BACK' && !backPath ? [BACK_CONSTRUCTION_UNVERIFIED] : [],
        }),
      ),
    );
    return Promise.all(jobs.map((j) => this.toJobDto(j)));
  }

  /** A controlled design edit: change only what was asked (optionally inside a mask). */
  async createEdit(
    actor: Actor,
    imageId: string,
    body: z.infer<typeof createEditBody>,
  ): Promise<CatalogJobDto> {
    const { image, job } = await this.requireImage(actor, imageId);
    if (body.maskPath) this.uploads.assertPath('CATALOG_INPUT', body.maskPath);
    if (body.contextPath) {
      this.uploads.assertPath('CATALOG_INPUT', body.contextPath);
      await this.uploads.cleanPhoto(body.contextPath);
    }
    const editType: CatalogEditType = body.editType ?? classifyEdit(body.instruction);
    const [created] = await this.queue(actor, [
      this.newJob(actor, {
        kind: 'EDIT',
        view: 'EDIT',
        prompt: body.prompt ?? buildEditPrompt(editType, body.instruction),
        editType,
        instruction: body.instruction,
        modelProfileId: job.modelProfileId,
        parentImageId: image.id,
        inputs: {
          ...job.inputs,
          sourcePath: image.storagePath,
          maskPath: body.maskPath,
          contextPath: body.contextPath,
          backPath: undefined,
          facePath: undefined,
          backgroundPath: undefined,
        },
        settings: body,
      }),
    ]);
    return this.toJobDto(created!);
  }

  async createReframe(
    actor: Actor,
    imageId: string,
    body: z.infer<typeof createReframeBody>,
  ): Promise<CatalogJobDto> {
    const { image, job } = await this.requireImage(actor, imageId);
    const [created] = await this.queue(actor, [
      this.newJob(actor, {
        kind: 'REFRAME',
        view: 'REFRAME',
        prompt: `Reframe to ${body.aspectRatio}`,
        modelProfileId: job.modelProfileId,
        parentImageId: image.id,
        inputs: { sourcePath: image.storagePath },
        settings: { resolution: body.resolution, mode: body.mode, numImages: 1, seed: job.seed },
        aspectRatio: body.aspectRatio,
      }),
    ]);
    return this.toJobDto(created!);
  }

  /** background-remove on an uploaded abaya photo (1 credit). */
  async createCleanup(
    actor: Actor,
    body: z.infer<typeof createCleanupBody>,
  ): Promise<CatalogJobDto> {
    this.uploads.assertPath('CATALOG_INPUT', body.imagePath);
    await this.uploads.cleanPhoto(body.imagePath);
    const [job] = await this.queue(actor, [
      this.newJob(actor, {
        kind: 'BACKGROUND_REMOVE',
        view: 'CLEANUP',
        prompt: 'Remove background',
        inputs: { sourcePath: body.imagePath },
        settings: { resolution: '1k', mode: 'fast', numImages: 1 },
      }),
    ]);
    return this.toJobDto(job!);
  }

  // ───────────── Review, retry, final ─────────────

  async review(
    actor: Actor,
    imageId: string,
    body: z.infer<typeof reviewCatalogImageBody>,
  ): Promise<CatalogJobDto> {
    const { image, job } = await this.requireImage(actor, imageId);
    const given = Object.fromEntries(
      Object.entries(body.scores ?? {}).filter(([, v]) => typeof v === 'number'),
    ) as Record<string, number>;
    const overall = overallScore(given);
    const scores = Object.keys(given).length
      ? { ...given, ...(overall !== null ? { overall } : {}) }
      : null;
    const reasons = body.review === 'REJECTED' ? body.reasons : [];
    await this.repo.reviewImage(
      image.id,
      { review: body.review, reasons, scores, note: body.note ?? null, reviewedById: actor.userId },
      this.audit(
        actor,
        'catalog.image_reviewed',
        'CatalogImage',
        { review: body.review, reasons, scores, jobId: job.id },
        image.id,
      ),
    );
    return this.get(actor, job.id);
  }

  /** Try a rejected image again with a stricter prompt (at most twice per chain). */
  async retry(actor: Actor, imageId: string): Promise<CatalogJobDto> {
    const { image, job } = await this.requireImage(actor, imageId);
    if (image.review !== 'REJECTED')
      throw new BusinessRuleError(
        'NOT_REJECTED',
        'Reject the image with a reason before trying again.',
      );
    if (job.retryCount >= MAX_CATALOG_RETRIES) {
      throw new BusinessRuleError(
        'RETRY_LIMIT',
        `This image was already tried again ${MAX_CATALOG_RETRIES} times. Change the inputs or prompt instead.`,
      );
    }
    const [created] = await this.queue(actor, [
      this.newJob(actor, {
        ...this.sameAs(job),
        prompt: retryPrompt(job.prompt, image.reasons as CatalogRejectReason[]),
        retryOfImageId: image.id,
        retryCount: job.retryCount + 1,
        settings: { resolution: job.resolution, mode: job.mode, numImages: 1, seed: job.seed + 1 },
      }),
    ]);
    return this.toJobDto(created!);
  }

  /** The approved preview again in 4K quality (same prompt, inputs and seed). */
  async final(actor: Actor, imageId: string): Promise<CatalogJobDto> {
    const { image, job } = await this.requireImage(actor, imageId);
    if (image.review !== 'APPROVED')
      throw new BusinessRuleError(
        'NOT_APPROVED',
        'Approve the preview before making the 4K final.',
      );
    const { resolution, mode } = CATALOG_PRESETS.FINAL;
    if (job.resolution === resolution && job.mode === mode)
      throw new BusinessRuleError('ALREADY_FINAL', 'This image is already a 4K final.');
    if (job.kind === 'BACKGROUND_REMOVE')
      throw new BusinessRuleError('NOT_SUPPORTED', 'Background removal has no 4K version.');
    const [created] = await this.queue(actor, [
      this.newJob(actor, {
        ...this.sameAs(job),
        parentImageId: job.parentImageId ?? image.id,
        settings: { resolution, mode, numImages: 1, seed: job.seed },
      }),
    ]);
    return this.toJobDto(created!);
  }

  /** Add an approved image to a design's photos (shown to customers when published). */
  /** Add one approved image to a design's photos (optionally as its main photo). */
  async useAsDesignPhoto(
    actor: Actor,
    imageId: string,
    designId: string,
    primary = false,
    colourValueId?: string,
  ): Promise<AdminDesignDetail> {
    const { image } = await this.requireApproved(actor, imageId);
    await this.designs.assertColourValues([colourValueId]);
    return this.addToDesign(actor, image, designId, primary, colourValueId);
  }

  /** A new draft design with this approved image as its main photo (AI-made, so it says so). */
  async createDesignFromImage(
    actor: Actor,
    imageId: string,
    body: { name: string; style: AbayaStyle; description?: string },
  ): Promise<AdminDesignDetail> {
    const { image, job } = await this.requireApproved(actor, imageId);
    const created = await this.designs.create(actor, {
      name: body.name,
      style: body.style,
      description: body.description,
      tags: [],
      leadTimeDays: 12,
      source: 'AI_GENERATED',
      aiGeneration: {
        generationId: job.id,
        prompt: job.prompt,
        model: `fashn ${job.endpoint}`,
        createdAt: job.createdAt.toISOString(),
      },
    });
    return this.addToDesign(actor, image, created.id, true);
  }

  /**
   * Add a whole approved set (master, poses…) to a design in the given order. Everything is
   * checked first, so nothing is added when one image is not approved.
   */
  async addSetToDesign(
    actor: Actor,
    designId: string,
    body: { imageIds: string[]; primaryImageId?: string; colourValueId?: string },
  ): Promise<AddCatalogSetResponse> {
    const ids = [...new Set(body.imageIds)];
    const found = await Promise.all(ids.map((id) => this.requireApproved(actor, id)));
    await this.designs.assertColourValues([body.colourValueId]);
    let added = 0;
    let skipped = 0;
    for (const { image } of found) {
      if (image.designId === designId) {
        skipped++;
        continue;
      }
      await this.addToDesign(actor, image, designId, image.id === body.primaryImageId, body.colourValueId);
      added++;
    }
    return { added, skipped };
  }

  private async requireApproved(actor: Actor, imageId: string) {
    const found = await this.requireImage(actor, imageId);
    if (found.image.review !== 'APPROVED') {
      throw new BusinessRuleError(
        'NOT_APPROVED',
        'Only approved images can be added to the catalog.',
        { imageId },
      );
    }
    return found;
  }

  /** Copy the image into the design's photos (shown to customers once published). */
  private async addToDesign(
    actor: Actor,
    image: CatalogImageRecord,
    designId: string,
    primary: boolean,
    colourValueId?: string,
  ): Promise<AdminDesignDetail> {
    const data = await this.files.read(image.storagePath);
    if (!data) throw new NotFoundError('Image');
    const type = image.storagePath.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    const path = this.uploads.pathFor('DESIGN_IMAGE', type);
    await this.files.write(path, data, type);
    const detail = await this.designs.attachImage(actor, designId, {
      storagePath: path,
      isPrimary: primary,
      colourValueId: colourValueId ?? null,
    });
    await this.repo.linkDesign(image.id, designId);
    return detail;
  }

  // ───────────── Reading ─────────────

  /** History, newest first, a page at a time. */
  async list(
    actor: Actor,
    query: { cursor?: string; limit: number; designId?: string },
  ): Promise<Paginated<CatalogJobDto>> {
    const page = await this.repo.listJobs({
      createdById: isManager(actor) ? undefined : actor.userId,
      ...query,
    });
    return {
      items: await Promise.all(page.items.map((j) => this.toJobDto(j))),
      nextCursor: page.nextCursor,
    };
  }

  /** Only the jobs still waiting or running: what the panel polls every few seconds. */
  async listActive(actor: Actor): Promise<CatalogJobDto[]> {
    const page = await this.repo.listJobs({
      createdById: isManager(actor) ? undefined : actor.userId,
      limit: 50,
      activeOnly: true,
    });
    return Promise.all(page.items.map((j) => this.toJobDto(j)));
  }

  async get(actor: Actor, id: string): Promise<CatalogJobDto> {
    const job = await this.repo.findJob(id);
    if (!job || (job.createdById !== actor.userId && !isManager(actor)))
      throw new NotFoundError('Generation');
    return this.toJobDto(job);
  }

  // ───────────── Helpers ─────────────

  private newJob(
    actor: Actor,
    j: {
      kind: NewCatalogJob['kind'];
      view: NewCatalogJob['view'];
      prompt: string;
      inputs: NewCatalogJob['inputs'];
      settings: {
        resolution: NewCatalogJob['resolution'];
        mode: NewCatalogJob['mode'];
        numImages: number;
        seed?: number;
      };
      modelProfileId?: string | null;
      parentImageId?: string | null;
      retryOfImageId?: string | null;
      retryCount?: number;
      editType?: string | null;
      instruction?: string | null;
      aspectRatio?: string | null;
      flags?: string[];
      designId?: string | null;
    },
  ): NewCatalogJob {
    return {
      createdById: actor.userId,
      designId: j.designId ?? null,
      kind: j.kind,
      view: j.view,
      modelProfileId: j.modelProfileId ?? null,
      parentImageId: j.parentImageId ?? null,
      retryOfImageId: j.retryOfImageId ?? null,
      retryCount: j.retryCount ?? 0,
      inputs: j.inputs,
      editType: j.editType ?? null,
      instruction: j.instruction ?? null,
      prompt: j.prompt,
      endpoint: FASHN_ENDPOINTS[j.kind],
      resolution: j.settings.resolution,
      mode: j.settings.mode,
      numImages: j.settings.numImages,
      seed: j.settings.seed ?? randomSeed(),
      aspectRatio: j.aspectRatio ?? null,
      creditsEstimated: creditCost({
        kind: j.kind,
        resolution: j.settings.resolution,
        mode: j.settings.mode,
        numImages: j.settings.numImages,
        // A face reference only travels with the one-step master (and its retries and final).
        faceReference: j.kind === 'PRODUCT_TO_MODEL' && Boolean(j.inputs.facePath),
      }),
      provider: this.fashn.live ? 'fashn' : 'test',
      flags: j.flags ?? [],
    };
  }

  /** Everything a retry or final keeps from the original job. */
  private sameAs(job: CatalogJobRecord) {
    return {
      kind: job.kind,
      view: job.view,
      prompt: job.prompt,
      inputs: job.inputs,
      modelProfileId: job.modelProfileId,
      parentImageId: job.parentImageId,
      editType: job.editType,
      instruction: job.instruction,
      aspectRatio: job.aspectRatio,
      flags: job.flags,
    };
  }

  /** Daily credit limit, then save (the worker sends them to FASHN). */
  private async queue(
    actor: Actor,
    jobs: NewCatalogJob[],
    now = new Date(),
  ): Promise<CatalogJobRecord[]> {
    const cost = jobs.reduce((n, j) => n + j.creditsEstimated, 0);
    const used = await this.repo.creditsSince(actor.userId, startOfIndiaDay(now));
    if (used + cost > this.config.FASHN_DAILY_CREDIT_LIMIT) {
      throw new BusinessRuleError(
        'DAILY_CREDIT_LIMIT',
        `This needs ${cost} credits, but only ${Math.max(0, this.config.FASHN_DAILY_CREDIT_LIMIT - used)} of today's ${this.config.FASHN_DAILY_CREDIT_LIMIT} are left. Try a smaller resolution or come back tomorrow.`,
        { cost, used, limit: this.config.FASHN_DAILY_CREDIT_LIMIT },
      );
    }
    return this.repo.createJobs(
      jobs,
      this.audit(actor, 'catalog.generation_requested', 'CatalogJob', {
        endpoint: jobs[0]?.endpoint,
        views: jobs.map((j) => j.view),
        credits: cost,
        resolution: jobs[0]?.resolution,
        mode: jobs[0]?.mode,
      }),
    );
  }

  private async requireImage(
    actor: Actor,
    imageId: string,
  ): Promise<{ image: CatalogImageRecord; job: CatalogJobRecord }> {
    const found = await this.repo.findImage(imageId);
    if (!found || (found.job.createdById !== actor.userId && !isManager(actor)))
      throw new NotFoundError('Image');
    return found;
  }

  private audit(
    actor: Actor,
    action: 'catalog.generation_requested' | 'catalog.image_reviewed' | 'catalog.model_created',
    entityType: string,
    after: object,
    entityId = '',
  ) {
    return {
      actorUserId: actor.userId,
      action,
      entityType,
      entityId,
      after: JSON.parse(JSON.stringify(after)) as Record<string, unknown>,
      ip: actor.ip,
    };
  }

  private async toJobDto(job: CatalogJobRecord): Promise<CatalogJobDto> {
    const sign = (p?: string) => (p ? this.files.signedUrl(p) : Promise.resolve(null));
    const [abayaUrl, backUrl, modelUrl, sourceUrl] = await Promise.all([
      sign(job.inputs.abayaPath),
      sign(job.inputs.backPath),
      sign(job.inputs.modelPath),
      sign(job.inputs.sourcePath),
    ]);
    const images: CatalogImageDto[] = await Promise.all(
      job.images.map(async (i) => ({
        id: i.id,
        jobId: job.id,
        url: await this.files.signedUrl(i.storagePath),
        review: i.review,
        reasons: i.reasons as CatalogRejectReason[],
        scores: i.scores,
        note: i.note,
        flags: job.flags,
        designId: i.designId,
        retriesLeft: Math.max(0, MAX_CATALOG_RETRIES - job.retryCount),
      })),
    );
    return {
      id: job.id,
      kind: job.kind,
      view: job.view,
      endpoint: job.endpoint,
      status: job.status,
      stage: stageLabel(job),
      editType: job.editType as CatalogEditType | null,
      instruction: job.instruction,
      style: (job.inputs.style as AbayaStyle | undefined) ?? null,
      embroidery: (job.inputs.embroidery as EmbroideryPlacement[] | undefined) ?? [],
      direction: job.inputs.direction ?? null,
      sketch: Boolean(job.inputs.sketch),
      references: await Promise.all(
        (job.inputs.references ?? []).map(async (r) => ({
          type: r.type as DesignReferenceType,
          path: r.path,
          url: await this.files.signedUrl(r.path),
          note: r.note ?? null,
        })),
      ),
      prompt: job.prompt,
      resolution: job.resolution,
      mode: job.mode,
      numImages: job.numImages,
      seed: job.seed,
      credits: job.creditsUsed ?? job.creditsEstimated,
      modelProfileId: job.modelProfileId,
      parentImageId: job.parentImageId,
      retryOfImageId: job.retryOfImageId,
      afterJobId: job.afterJobId,
      designId: job.designId,
      inputs: { abayaUrl, backUrl, modelUrl, sourceUrl },
      provider: job.provider === 'fashn' ? 'fashn' : 'test',
      error: job.error && job.status === 'FAILED' ? job.error : null,
      createdAt: job.createdAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString() ?? null,
      images,
    };
  }

  // ───────────── FASHN usage (admin report; composed by the usage module) ─────────────

  /** Studio jobs per staff member in [since, until). */
  usageByCreator(since: Date, until: Date): Promise<StudioUsageRow[]> {
    return this.repo.usageByCreator(since, until);
  }

  /** One staff member's Studio jobs, newest first, each with its first picture. */
  async usageJobs(userId: string, since: Date, until: Date, limit: number): Promise<StudioUsageJob[]> {
    const jobs = await this.repo.listJobsByCreator(userId, since, until, limit);
    return Promise.all(
      jobs.map(async (j) => {
        const first = j.status === 'DONE' ? j.images[0] : undefined;
        return {
          id: j.id,
          kind: j.kind,
          view: j.view,
          designId: j.designId,
          status: j.status,
          credits: j.status === 'FAILED' ? 0 : (j.creditsUsed ?? j.creditsEstimated),
          remakes: j.retryOfImageId ? 1 : 0,
          thumbnailUrl: first ? await this.files.signedUrl(first.storagePath) : null,
          createdAt: j.createdAt,
        };
      }),
    );
  }

  private async toProfileDto(p: CatalogModelProfileRecord): Promise<CatalogModelProfileDto> {
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      imageUrl: await this.files.signedUrl(p.imagePath),
      description: p.description,
      abayaCount: p.abayaCount,
      createdBy: p.createdBy,
      createdAt: p.createdAt.toISOString(),
    };
  }
}

const toPresetDto = (p: CatalogPromptPresetRecord): CatalogPromptPresetDto => ({
  id: p.id,
  name: p.name,
  text: p.text,
  createdBy: p.createdBy,
  createdAt: p.createdAt.toISOString(),
});

/** "25, Indian, medium warm skin, black chiffon hijab" */
const describe = (a: Record<string, string | number>) =>
  [a.age, a.appearance, a.skinTone ? `${a.skinTone} skin` : '', a.hijab || a.hair, a.bodyType]
    .filter(Boolean)
    .join(', ');

/** One Studio job in the FASHN usage report. */
export interface StudioUsageJob {
  id: string;
  kind: string;
  view: string;
  designId: string | null;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  credits: number;
  remakes: number;
  thumbnailUrl: string | null;
  createdAt: Date;
}
