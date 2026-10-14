import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { fixInstruction } from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { UploadsService } from '../../media/application/uploads.service';
import { WatermarkService } from '../../watermark/application/watermark.service';
import {
  checkQuestion,
  INACCURATE_TRYON_MESSAGE,
  tryOnCheckQuestion,
  CUSTOMER_FASHN_CONCURRENCY,
  customerError,
  fashnInputs,
  modelTryOnCheckQuestion,
  INACCURATE_MESSAGE,
  INPUT_URL_TTL_SECONDS,
  isTemporaryFailure,
  JOB_TIMEOUT_MS,
  judge,
  MAX_ATTEMPTS,
  MAX_CHECK_RETRIES,
  POLL_INTERVAL_MS,
  planCredits,
  TRYON_CHECK_SIDE,
  type PreviewCheck,
  retryDelayMs,
} from '../domain/try-on.rules';
import {
  CUSTOMER_PREVIEW_REPOSITORY,
  type CustomerPreviewRecord,
  type CustomerPreviewRepository,
  FASHN_CLIENT,
  type FashnClient,
  FashnRequestError,
  FACE_KEEPER,
  type FaceKeeper,
  PREVIEW_CHECKER,
  type PreviewChecker,
  TRYON_FILES,
  type TryOnFiles,
} from './ports/try-on.ports';

const TICK_MS = 2_000;
const LEASE_MS = 60_000;

const mimeOf = (path: string) => (path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

/**
 * Sends website previews and try-ons to FASHN, step by step (a preview is colour and fabric
 * first, then the visible details), checks a finished preview against the original photo with
 * Gemini vision, remakes it once when the check fails, saves results to private storage, and
 * deletes try-on photos and results once they expire. Off in tests (they call runOnce).
 */
/** How often AI pictures past their hour are looked for. */
const SWEEP_EVERY_MS = 60_000;

@Injectable()
export class TryOnWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TryOnWorker.name);
  private timer?: NodeJS.Timeout;
  private busy = false;
  /** When pictures past their hour were last looked for (the sweep runs every minute). */
  private lastSweep = 0;

  constructor(
    @Inject(CUSTOMER_PREVIEW_REPOSITORY) private readonly repo: CustomerPreviewRepository,
    @Inject(FASHN_CLIENT) private readonly fashn: FashnClient,
    @Inject(TRYON_FILES) private readonly files: TryOnFiles,
    @Inject(PREVIEW_CHECKER) private readonly checker: PreviewChecker,
    @Inject(FACE_KEEPER) private readonly faces: FaceKeeper,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'TRYON_WORKER_ENABLED' | 'CUSTOMER_AI_KEEP_MINUTES' | 'CUSTOMER_AI_PREVIEW_KEEP_HOURS'>,
    private readonly uploads: UploadsService,
    private readonly watermark: WatermarkService,
  ) {}

  onModuleInit(): void {
    if (!this.config.TRYON_WORKER_ENABLED) return;
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
      this.logger.error({ err: e }, 'Try-on worker failed');
    } finally {
      this.busy = false;
    }
  }

  async runOnce(now = new Date()): Promise<{ submitted: number; finished: number; deleted: number; purged: number }> {
    const lease = new Date(now.getTime() + LEASE_MS);
    let finished = 0;
    for (const row of await this.repo.claimDue('RUNNING', now, lease, 20)) {
      if (await this.check(row, now)) finished++;
    }
    let submitted = 0;
    const free = CUSTOMER_FASHN_CONCURRENCY - (await this.repo.countRunning());
    for (const row of await this.repo.claimDue('QUEUED', now, lease, free)) {
      if (await this.submit(row, now)) submitted++;
    }
    const deleted = await this.deleteExpired(now);
    let purged = 0;
    // Every minute (and whenever the clock went back, e.g. after a server time correction).
    if (now.getTime() - this.lastSweep >= SWEEP_EVERY_MS || now.getTime() < this.lastSweep) {
      this.lastSweep = now.getTime();
      purged = await this.purgeExpired(now);
    }
    return { submitted, finished, deleted, purged };
  }

  /**
   * Each customer sees an AI picture for CUSTOMER_AI_KEEP_MINUTES after she got it. Once nobody's
   * hour is left (a shared preview may have several customers), its files are deleted (the
   * picture, and her own photo for a try-on) and the paths cleared. The row stays, marked, so
   * credits and daily limits stay right. Previews and "a model like me" try-ons (no photo of her)
   * are kept longer, for the admin's Customer AI previews page (CUSTOMER_AI_PREVIEW_KEEP_HOURS);
   * try-ons on her own photo never are.
   */
  private async purgeExpired(now: Date): Promise<number> {
    const keepMs = this.config.CUSTOMER_AI_KEEP_MINUTES * 60_000;
    const previewKeepMs = Math.max(keepMs, this.config.CUSTOMER_AI_PREVIEW_KEEP_HOURS * 60 * 60_000);
    const madeBefore = { photoTryOns: new Date(now.getTime() - keepMs), keptForAdmin: new Date(now.getTime() - previewKeepMs) };
    let purged = 0;
    for (const row of await this.repo.listUnclaimed(now, madeBefore, 200)) {
      await this.files.remove([row.resultPath, row.personPath, row.workingPath].filter((p): p is string => Boolean(p)));
      await this.repo.markPurged(row.id, now);
      purged++;
    }
    if (purged > 0) this.logger.log(`Deleted ${purged} expired AI picture(s)`);
    return purged;
  }

  private async submit(row: CustomerPreviewRecord, now: Date): Promise<boolean> {
    try {
      const sign = (path: string | null) => (path ? this.files.signedUrl(path, INPUT_URL_TTL_SECONDS) : Promise.resolve(undefined));
      // The design photo, the previous step's picture (later steps), and her photo (photo try-on).
      const [source, working, person] = await Promise.all([
        this.files.signedUrl(row.sourcePath, INPUT_URL_TTL_SECONDS),
        sign(row.workingPath),
        sign(row.personPath),
      ]);
      const prompt = row.steps[row.step] ?? row.prompt;
      const endpoint = row.stepEndpoints[row.step] ?? row.endpoint;
      const { id } = await this.fashn.run(endpoint, fashnInputs(endpoint, prompt, { source: source!, working, person }));
      await this.repo.markSubmitted(row.id, id, now, new Date(now.getTime() + POLL_INTERVAL_MS));
      return true;
    } catch (e) {
      if (e instanceof FashnRequestError) {
        if (e.kind === 'auth') return this.fail(row, 'UnauthorizedAccess', now);
        if (e.kind === 'credits') return this.fail(row, 'OutOfCredits', now);
        if (e.kind === 'invalid') return this.fail(row, 'InputValidationError', now);
        if (row.attempts + 1 >= MAX_ATTEMPTS * 2) return this.fail(row, 'UnavailableError', now);
        await this.repo.reschedule(row.id, new Date(now.getTime() + retryDelayMs(1)), { countAttempt: true, error: e.message });
        return false;
      }
      this.logger.warn({ id: row.id, err: e instanceof Error ? e.message : e }, 'Could not prepare customer preview');
      return this.fail(row, 'ImageLoadError', now);
    }
  }

  /** True when the request is finished (done or failed). */
  private async check(row: CustomerPreviewRecord, now: Date): Promise<boolean> {
    if (!row.providerJobId) {
      await this.repo.reschedule(row.id, now, { requeue: true });
      return false;
    }
    if (row.submittedAt && now.getTime() - row.submittedAt.getTime() > JOB_TIMEOUT_MS) {
      return this.fail(row, 'Timeout', now);
    }
    let status;
    try {
      status = await this.fashn.status(row.providerJobId);
    } catch {
      await this.repo.reschedule(row.id, new Date(now.getTime() + POLL_INTERVAL_MS * 2));
      return false;
    }
    if (status.state === 'pending') {
      await this.repo.reschedule(row.id, new Date(now.getTime() + POLL_INTERVAL_MS));
      return false;
    }
    if (status.state === 'failed') {
      if (isTemporaryFailure(status.errorName) && row.attempts < MAX_ATTEMPTS) {
        await this.repo.reschedule(row.id, new Date(now.getTime() + retryDelayMs(row.attempts)), {
          requeue: true,
          error: status.errorName,
        });
        return false;
      }
      return this.fail(row, status.errorName, now);
    }
    const url = status.output[0];
    if (!url) return this.fail(row, 'PipelineError', now);
    let path: string;
    let data: Buffer;
    try {
      // FASHN deletes its copy after a few days: keep ours.
      const file = await this.fashn.download(url);
      let picture: { data: Buffer; contentType: typeof file.contentType } = { data: file.data, contentType: file.contentType };
      // A photo try-on, last step: her own face goes back on (FASHN retouches faces).
      if (row.kind === 'TRYON' && row.personPath && row.step >= row.steps.length - 1) {
        const photo = await this.files.read(row.personPath);
        const kept = photo ? await this.faces.keepFace(photo, file.data) : null;
        if (kept?.kept) picture = { data: kept.data, contentType: 'image/jpeg' };
        if (kept) this.logger.log(`Face lock ${kept.kept ? 'applied' : 'skipped (head moved)'} for ${row.id}, match ${kept.score.toFixed(2)}`);
      }
      path = this.uploads.pathFor('CUSTOMER_PREVIEW', picture.contentType);
      await this.files.write(path, picture.data, picture.contentType);
      data = picture.data;
    } catch (e) {
      this.logger.warn({ id: row.id, err: e instanceof Error ? e.message : e }, 'Could not save customer preview');
      await this.repo.reschedule(row.id, new Date(now.getTime() + retryDelayMs(1)));
      return false;
    }
    // The previous step's picture is no longer needed.
    if (row.workingPath) await this.files.remove([row.workingPath]);

    // More steps to go (preview details, the made-to-measure fit, or the try-on on her model).
    if (row.step < row.steps.length - 1) {
      await this.repo.nextStep(row.id, path, row.step + 1);
      return false;
    }
    return this.verify(row, path, data, now);
  }

  /**
   * The picture she is shown carries a visible watermark (a faint diagonal "Abaya Atelier · AI
   * preview" across the whole picture and a corner badge), an invisible one with this request's
   * id (so a copy found online can be traced to it), and a copyright notice. If marking fails the
   * picture is still shown, unmarked, rather than lost.
   */
  private async finish(row: CustomerPreviewRecord, path: string, data: Buffer, now: Date, notes: string): Promise<void> {
    try {
      const kind = row.kind === 'TRYON' ? 'TRYON' : 'PREVIEW';
      const marked = await this.watermark.mark(data, { kind, id: row.id }, { quality: 88, visible: true });
      await this.files.write(path, marked.body, marked.contentType);
    } catch (e) {
      this.logger.warn({ id: row.id, err: e instanceof Error ? e.message : e }, 'Could not watermark customer picture');
    }
    await this.repo.complete(row.id, path, now, notes);
  }

  /**
   * Gemini checks the finished picture: a preview against the original photo; a try-on against
   * the abaya photo and her own photo (same woman, same embroidery, same colour). Pass: shown.
   * Fail: remade once with the problems named; fail again: she is told no accurate picture
   * could be made. No checker or no answer: shown unchecked.
   */
  private async verify(row: CustomerPreviewRecord, path: string, data: Buffer, now: Date): Promise<true> {
    const checks = (Array.isArray(row.checks) ? row.checks : []) as PreviewCheck[];
    const answers = checks.length > 0 && this.checker.available ? await this.askChecker(row, checks, path, data) : null;
    if (!answers) {
      await this.finish(row, path, data, now, 'Not checked');
      return true;
    }
    const verdict = judge(checks, answers);
    if (verdict.pass) {
      await this.finish(row, path, data, now, verdict.problems.length ? `Checked (minor: ${verdict.problems.join(' ')})` : 'Checked');
      return true;
    }
    await this.files.remove([path]);
    const notes = verdict.problems.join(' ');
    if (row.retries < MAX_CHECK_RETRIES) {
      const fix = fixInstruction(verdict.problems);
      await this.repo.restart(row.id, row.steps.map((s) => `${s} ${fix}`), planCredits(row.stepEndpoints.length ? row.stepEndpoints : row.steps.map(() => row.endpoint)), `Remade: ${notes}`);
      return true;
    }
    this.logger.warn({ id: row.id, kind: row.kind, problems: verdict.problems }, 'Customer picture failed the accuracy check twice');
    await this.repo.failInaccurate(row.id, row.kind === 'TRYON' ? INACCURATE_TRYON_MESSAGE : INACCURATE_MESSAGE, `Failed twice: ${notes}`, now);
    return true;
  }

  private async askChecker(row: CustomerPreviewRecord, checks: PreviewCheck[], path: string, data: Buffer) {
    const result = { label: row.kind === 'TRYON' ? 'Image 3 (try-on result)' : 'Image 2 (AI-edited preview)', data, mimeType: mimeOf(path) };
    const garment = await this.files.read(row.sourcePath);
    if (!garment) return null;
    if (row.kind === 'PREVIEW') {
      return this.checker.check(
        [{ label: 'Image 1 (original)', data: garment, mimeType: mimeOf(row.sourcePath) }, result],
        checkQuestion(checks),
        checks.length,
      );
    }
    // "A model like me": no photo of her, the result is checked against the abaya only.
    if (!row.personPath) {
      return this.checker.check(
        [{ label: 'Image 1 (the abaya)', data: garment, mimeType: mimeOf(row.sourcePath) }, { ...result, label: 'Image 2 (try-on result)' }],
        modelTryOnCheckQuestion(checks),
        checks.length,
        { maxSide: TRYON_CHECK_SIDE },
      );
    }
    const person = await this.files.read(row.personPath);
    if (!person) return null;
    return this.checker.check(
      [
        { label: 'Image 1 (the abaya)', data: garment, mimeType: mimeOf(row.sourcePath) },
        { label: 'Image 2 (her photo)', data: person, mimeType: mimeOf(row.personPath!) },
        result,
      ],
      tryOnCheckQuestion(checks),
      checks.length,
      { maxSide: TRYON_CHECK_SIDE },
    );
  }

  private async fail(row: CustomerPreviewRecord, errorName: string, now: Date): Promise<true> {
    await this.repo.fail(row.id, customerError(errorName), now);
    return true;
  }

  /** Try-on photos and results are deleted 30 days after they were made. */
  private async deleteExpired(now: Date): Promise<number> {
    const rows = await this.repo.listExpired(now, 50);
    for (const row of rows) {
      await this.files.remove([row.personPath, row.resultPath].filter((p): p is string => Boolean(p)));
      await this.repo.delete(row.id);
    }
    return rows.length;
  }
}
