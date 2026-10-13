import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { UploadsService } from '../../media/application/uploads.service';
import {
  FASHN_CONCURRENCY,
  fashnInputs,
  friendlyError,
  INPUT_URL_TTL_SECONDS,
  isTemporaryFailure,
  JOB_TIMEOUT_MS,
  MAX_SUBMIT_ATTEMPTS,
  POLL_INTERVAL_MS,
  retryDelayMs,
  type SignedInputs,
} from '../domain/catalog.rules';
import {
  CATALOG_FILES,
  CATALOG_REPOSITORY,
  type CatalogFiles,
  type CatalogJobRecord,
  type CatalogRepository,
  FASHN_CLIENT,
  type FashnClient,
  FashnRequestError,
} from './ports/catalog.ports';

const TICK_MS = 3_000;
/** A claimed job is hidden from other workers this long while it is being handled. */
const LEASE_MS = 90_000;

/**
 * Sends queued AI Catalog jobs to FASHN (never more than 6 at once), checks running ones, and
 * copies finished images into our private storage. Off in tests, which call runOnce().
 */
@Injectable()
export class CatalogWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CatalogWorker.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(FASHN_CLIENT) private readonly fashn: FashnClient,
    @Inject(CATALOG_FILES) private readonly files: CatalogFiles,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'CATALOG_WORKER_ENABLED'>,
    private readonly uploads: UploadsService,
  ) {}

  onModuleInit(): void {
    if (!this.config.CATALOG_WORKER_ENABLED) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.logger.error({ err: e }, 'AI Catalog worker failed');
    } finally {
      this.busy = false;
    }
  }

  /** One pass: check running jobs, then submit as many queued ones as there are free slots. */
  async runOnce(
    now = new Date(),
  ): Promise<{ submitted: number; finished: number; retried: number }> {
    let finished = 0;
    let retried = 0;
    for (const job of await this.repo.claimDue(
      'RUNNING',
      now,
      new Date(now.getTime() + LEASE_MS),
      20,
    )) {
      const outcome = await this.check(job, now);
      if (outcome === 'finished') finished++;
      if (outcome === 'retry') retried++;
    }
    const free = FASHN_CONCURRENCY - (await this.repo.countRunning());
    let submitted = 0;
    for (const job of await this.repo.claimDue(
      'QUEUED',
      now,
      new Date(now.getTime() + LEASE_MS),
      free,
    )) {
      if (await this.submit(job, now)) submitted++;
    }
    return { submitted, finished, retried };
  }

  private async submit(job: CatalogJobRecord, now: Date): Promise<boolean> {
    if (job.afterJobId && !job.inputs.sourcePath) {
      // A chained step: start from the image the step before made.
      const previous = await this.repo.findJob(job.afterJobId);
      const image = previous?.images[0];
      if (!previous || previous.status === 'FAILED' || !image)
        return this.giveUp(job, 'PreviousStepFailed');
      await this.repo.startFrom(job.id, image);
      job = {
        ...job,
        parentImageId: image.id,
        inputs: { ...job.inputs, sourcePath: image.storagePath },
      };
    }
    try {
      const inputs = fashnInputs(job, await this.signInputs(job));
      const { id } = await this.fashn.run(job.endpoint, inputs);
      await this.repo.markSubmitted(job.id, id, now, new Date(now.getTime() + POLL_INTERVAL_MS));
      return true;
    } catch (e) {
      if (e instanceof FashnRequestError) {
        if (e.kind === 'auth') return this.giveUp(job, 'UnauthorizedAccess');
        if (e.kind === 'credits') return this.giveUp(job, 'OutOfCredits');
        if (e.kind === 'invalid') return this.giveUp(job, 'InputValidationError');
        // Rate limit, overload, network: try again shortly (no credits are used).
        if (job.attempts + 1 >= MAX_SUBMIT_ATTEMPTS * 2)
          return this.giveUp(job, 'UnavailableError');
        await this.repo.reschedule(job.id, new Date(now.getTime() + retryDelayMs(1)), {
          error: e.message,
          countAttempt: true,
        });
        return false;
      }
      this.logger.warn(
        { jobId: job.id, err: e instanceof Error ? e.message : e },
        'Could not prepare catalog job',
      );
      return this.giveUp(job, 'ImageLoadError');
    }
  }

  /** finished: done or failed; retry: sent back to the queue; waiting: still running. */
  private async check(job: CatalogJobRecord, now: Date): Promise<'finished' | 'retry' | 'waiting'> {
    if (!job.providerJobId) {
      await this.repo.reschedule(job.id, now, { requeue: true });
      return 'retry';
    }
    if (job.submittedAt && now.getTime() - job.submittedAt.getTime() > JOB_TIMEOUT_MS) {
      await this.giveUp(job, 'Timeout');
      return 'finished';
    }
    let status;
    try {
      status = await this.fashn.status(job.providerJobId);
    } catch {
      await this.repo.reschedule(job.id, new Date(now.getTime() + POLL_INTERVAL_MS * 2));
      return 'waiting';
    }
    if (status.state === 'pending') {
      await this.repo.reschedule(job.id, new Date(now.getTime() + POLL_INTERVAL_MS));
      return 'waiting';
    }
    if (status.state === 'failed') {
      this.logger.warn({ jobId: job.id, error: status.errorName }, 'FASHN prediction failed');
      if (isTemporaryFailure(status.errorName) && job.attempts < MAX_SUBMIT_ATTEMPTS) {
        await this.repo.reschedule(job.id, new Date(now.getTime() + retryDelayMs(job.attempts)), {
          requeue: true,
          error: status.errorName,
        });
        return 'retry';
      }
      await this.giveUp(job, status.errorName);
      return 'finished';
    }
    if (status.output.length === 0) {
      await this.giveUp(job, 'PipelineError');
      return 'finished';
    }
    try {
      const paths: string[] = [];
      for (const url of status.output) {
        const file = await this.fashn.download(url);
        const path = this.uploads.pathFor('CATALOG_IMAGE', file.contentType);
        await this.files.write(path, file.data, file.contentType);
        paths.push(path);
      }
      await this.repo.complete(job.id, paths, status.creditsUsed ?? job.creditsEstimated);
    } catch (e) {
      // Storage or download hiccup: FASHN keeps the result for 3 days, so look again soon.
      this.logger.warn(
        { jobId: job.id, err: e instanceof Error ? e.message : e },
        'Could not save catalog result',
      );
      await this.repo.reschedule(job.id, new Date(now.getTime() + retryDelayMs(1)));
      return 'retry';
    }
    return 'finished';
  }

  private async giveUp(job: CatalogJobRecord, errorName: string): Promise<true> {
    await this.repo.fail(job.id, friendlyError(errorName));
    return true;
  }

  private async signInputs(job: CatalogJobRecord): Promise<SignedInputs> {
    const sign = (path?: string) =>
      path ? this.files.signedUrl(path, INPUT_URL_TTL_SECONDS) : Promise.resolve(undefined);
    const i = job.inputs;
    const [abaya, model, source, back, mask, context, face, background] = await Promise.all([
      sign(i.abayaPath),
      sign(i.modelPath),
      sign(i.sourcePath),
      sign(i.backPath),
      sign(i.maskPath),
      sign(i.contextPath),
      // Face and background photos only travel with the one-step master (and its retries/final).
      job.kind === 'PRODUCT_TO_MODEL' ? sign(i.facePath) : Promise.resolve(undefined),
      job.kind === 'PRODUCT_TO_MODEL' ? sign(i.backgroundPath) : Promise.resolve(undefined),
    ]);
    return { abaya, model, source, back, mask, context, face, background };
  }
}
