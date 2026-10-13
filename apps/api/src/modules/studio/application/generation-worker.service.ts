import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ABAYA_STYLES, buildGenerationPrompt, type GenerationBody } from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { UploadsService } from '../../media/application/uploads.service';
import { GENERATION_LEASE_MS, MAX_GENERATION_ATTEMPTS, retryDelayMs } from '../domain/studio.rules';
import {
  type GenerationRecord,
  IMAGE_GENERATOR,
  type ImageGenerator,
  PermanentGenerationError,
  STUDIO_FILES,
  STUDIO_REPOSITORY,
  type StudioFiles,
  type StudioRepository,
} from './ports/studio.ports';

const POLL_INTERVAL_MS = 5_000;

/** Display name of a style for the prompt (e.g. OPEN_FRONT → "Open front"). */
const styleLabel = (style: string) => style.charAt(0) + style.slice(1).toLowerCase().replace(/_/g, ' ');

/**
 * Makes the variations of queued generations in the background (one generation at a time,
 * one image per model call). Leased rows, so several API instances can run it. The request
 * that queued the work never waits for it.
 */
@Injectable()
export class GenerationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private again = false;

  constructor(
    @Inject(STUDIO_REPOSITORY) private readonly repo: StudioRepository,
    @Inject(IMAGE_GENERATOR) private readonly generator: ImageGenerator,
    @Inject(STUDIO_FILES) private readonly files: StudioFiles,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'STUDIO_WORKER_ENABLED' | 'AI_IMAGES_PER_GENERATION'>,
    private readonly uploads: UploadsService,
  ) {}

  onModuleInit(): void {
    if (!this.config.STUDIO_WORKER_ENABLED) return;
    this.timer = setInterval(() => this.kick(), POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  kick(): void {
    if (!this.config.STUDIO_WORKER_ENABLED) return;
    if (this.running) {
      this.again = true;
      return;
    }
    setImmediate(() => void this.drain());
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      do {
        this.again = false;
        if (await this.runOnce()) this.again = true;
      } while (this.again);
    } catch (e) {
      this.logger.error({ err: e }, 'Studio worker failed');
    } finally {
      this.running = false;
    }
  }

  /** Work one generation; returns whether there was one. Tests call this directly. */
  async runOnce(now = new Date()): Promise<boolean> {
    const generation = await this.repo.claimNext(now, GENERATION_LEASE_MS);
    if (!generation) return false;
    try {
      const paths = await this.make(generation);
      await this.repo.complete(generation.id, paths);
    } catch (e) {
      const permanent = e instanceof PermanentGenerationError || generation.attempts >= MAX_GENERATION_ATTEMPTS;
      const message = e instanceof Error ? e.message : 'Image generation failed';
      this.logger.warn({ generationId: generation.id, attempts: generation.attempts, err: message }, 'Generation failed');
      await this.repo.fail(
        generation.id,
        permanent ? friendly(message) : message,
        permanent ? null : new Date(now.getTime() + retryDelayMs(generation.attempts)),
      );
    }
    return true;
  }

  private async make(g: GenerationRecord): Promise<string[]> {
    const options = g.options as Partial<GenerationBody> & { style: (typeof ABAYA_STYLES)[number] };
    const sketchBytes = g.sketchPath ? await this.files.read(g.sketchPath) : null;
    const prompt = buildGenerationPrompt({ ...options, prompt: g.prompt } as GenerationBody, styleLabel(options.style), Boolean(sketchBytes));
    const paths: string[] = [];
    for (let i = 0; i < this.config.AI_IMAGES_PER_GENERATION; i++) {
      const image = await this.generator.generate({
        prompt,
        sketch: sketchBytes ? { data: sketchBytes, mimeType: g.sketchPath!.endsWith('.png') ? 'image/png' : 'image/jpeg' } : undefined,
        variation: i + 1,
        colour: options.colour,
      });
      const path = this.uploads.pathFor('DESIGN_IMAGE', image.mimeType);
      await this.files.write(path, image.data, image.mimeType);
      paths.push(path);
    }
    return paths;
  }
}

/** What the designer reads when a generation gives up. */
function friendly(message: string): string {
  if (/safety|blocked|policy/i.test(message)) return 'The image model declined this request. Try describing the design differently.';
  if (/key|permission|unauth|403|401/i.test(message)) return 'The image model is not set up correctly. Ask the admin to check the AI key.';
  return 'The images could not be made. Please try again.';
}
