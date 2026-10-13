import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { nextAttemptAfterFailure } from '../domain/similarity';
import {
  AI_REPOSITORY,
  type AiRepository,
  AnalyzerUnavailableError,
  type ClaimedImage,
  IMAGE_ANALYZER,
  IMAGE_URL_SIGNER,
  type ImageAnalyzer,
  type ImageUrlSigner,
  PermanentAnalysisError,
} from './ports/ai.ports';

const POLL_INTERVAL_MS = 10_000;
const BATCH_SIZE = 8;
/** When the AI service is down, look again after this long (no attempts used up). */
const UNAVAILABLE_RETRY_MS = 30_000;

export interface AiWorkResult {
  done: number;
  retried: number;
  failed: number;
  deferred: number;
}

/**
 * Analyses queued images one by one through the AI service. Rows are leased with
 * FOR UPDATE SKIP LOCKED (same pattern as the notification outbox), so several API
 * instances can run it. Uploads never wait for it.
 */
@Injectable()
export class AiWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private again = false;

  constructor(
    @Inject(AI_REPOSITORY) private readonly repo: AiRepository,
    @Inject(IMAGE_ANALYZER) private readonly analyzer: ImageAnalyzer,
    @Inject(IMAGE_URL_SIGNER) private readonly signer: ImageUrlSigner,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'AI_WORKER_ENABLED'>,
  ) {}

  private get active(): boolean {
    return this.config.AI_WORKER_ENABLED && this.analyzer.enabled;
  }

  onModuleInit(): void {
    if (!this.active) return;
    this.timer = setInterval(() => this.kick(), POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Start working soon, without blocking the caller (tests call runOnce instead). */
  kick(): void {
    if (!this.active) return;
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
        const r = await this.runOnce();
        if (r.done + r.retried + r.failed === BATCH_SIZE && r.deferred === 0) this.again = true;
      } while (this.again);
    } catch (e) {
      this.logger.error({ err: e }, 'AI worker failed');
    } finally {
      this.running = false;
    }
  }

  /** Analyse one batch of due images. */
  async runOnce(now = new Date()): Promise<AiWorkResult> {
    const result: AiWorkResult = { done: 0, retried: 0, failed: 0, deferred: 0 };
    if (!this.analyzer.enabled) return result;
    const batch = await this.repo.claimDue(BATCH_SIZE);
    for (let i = 0; i < batch.length; i++) {
      const outcome = await this.analyzeOne(batch[i]!, now);
      if (outcome === 'unavailable') {
        // Service down: hand this and the rest of the batch back untouched.
        const rest = batch.slice(i).map((b) => b.id);
        await this.repo.release(rest, new Date(now.getTime() + UNAVAILABLE_RETRY_MS));
        result.deferred += rest.length;
        break;
      }
      result[outcome] += 1;
    }
    return result;
  }

  private async analyzeOne(job: ClaimedImage, now: Date): Promise<'done' | 'retried' | 'failed' | 'unavailable'> {
    try {
      const url = await this.signer.urlFor(job.source);
      const analysis = await this.analyzer.analyze(url);
      await this.repo.saveResult(job.id, analysis);
      return 'done';
    } catch (e) {
      if (e instanceof AnalyzerUnavailableError) {
        this.logger.warn(`AI service unavailable: ${e.message}`);
        return 'unavailable';
      }
      const message = e instanceof Error ? e.message : String(e);
      const attempts = job.attempts + 1;
      const next = e instanceof PermanentAnalysisError ? null : nextAttemptAfterFailure(attempts, now);
      if (next) {
        await this.repo.markRetry(job.id, attempts, next, message);
        return 'retried';
      }
      this.logger.warn({ image: `${job.kind}:${job.subjectId}`, error: message }, 'Image analysis failed');
      await this.repo.markFailed(job.id, attempts, message);
      return 'failed';
    }
  }
}
