import { Inject, Injectable } from '@nestjs/common';
import { ABAYA_STYLES } from '@abaya/contracts';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import {
  type AnalysisResult,
  type AnalyzerHealth,
  AnalyzerUnavailableError,
  type ImageAnalyzer,
  PermanentAnalysisError,
} from '../application/ports/ai.ports';

/** Analysis downloads the image and runs the model on CPU: allow for a slow first call. */
const ANALYZE_TIMEOUT_MS = 90_000;
const HEALTH_TIMEOUT_MS = 3_000;

const analyzeResponse = z.object({
  model: z.string().min(1).max(100),
  tagger: z.string().min(1).max(40),
  embedding: z.array(z.number().finite()).min(16).max(4096),
  phash: z.string().regex(/^[0-9a-f]{16}$/i),
  tags: z.array(z.object({ tag: z.string(), group: z.string(), label: z.string(), score: z.number() })).max(60),
  style: z.object({ value: z.enum(ABAYA_STYLES), score: z.number() }).nullable(),
  alt_text: z.string().max(300).nullable().optional(),
});

/** Calls the Python AI service (services/ai) with the shared bearer token. */
@Injectable()
export class HttpImageAnalyzer implements ImageAnalyzer {
  private readonly baseUrl: string | null;
  private readonly token: string;

  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, 'AI_SERVICE_URL' | 'AI_SERVICE_TOKEN'>) {
    this.baseUrl = config.AI_SERVICE_URL ? config.AI_SERVICE_URL.replace(/\/$/, '') : null;
    this.token = config.AI_SERVICE_TOKEN ?? '';
  }

  get enabled(): boolean {
    return this.baseUrl !== null;
  }

  async analyze(imageUrl: string): Promise<AnalysisResult> {
    if (!this.baseUrl) throw new AnalyzerUnavailableError('AI service is not configured');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ image_url: imageUrl }),
        signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') throw new Error('AI service timed out');
      throw new AnalyzerUnavailableError(`cannot reach ${this.baseUrl} (${e instanceof Error ? e.message : String(e)})`);
    }

    if (response.status === 422) throw new PermanentAnalysisError(await this.detail(response));
    // 401: token mismatch between API and AI service; retried, so fixing .env is enough.
    if (response.status === 401) throw new Error('AI service rejected AI_SERVICE_TOKEN');
    // 503 while the model is still loading, 502 when the image could not be downloaded: retry.
    if (!response.ok) throw new Error(`AI service error ${response.status}: ${await this.detail(response)}`);

    const parsed = analyzeResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new Error('AI service sent an unexpected response');
    const body = parsed.data;
    return {
      model: body.model,
      tagger: body.tagger,
      embedding: body.embedding,
      phash: body.phash.toLowerCase(),
      tags: body.tags,
      style: body.style,
      altText: body.alt_text?.trim() || null,
    };
  }

  async health(): Promise<AnalyzerHealth> {
    const down = { reachable: false, model: null, tagger: null, loaded: false };
    if (!this.baseUrl) return down;
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
      if (!response.ok) return down;
      const body = (await response.json()) as { model?: string; tagger?: string; loaded?: boolean; status?: string };
      return {
        reachable: body.status === 'ok',
        model: typeof body.model === 'string' ? body.model : null,
        tagger: typeof body.tagger === 'string' ? body.tagger : null,
        loaded: body.loaded === true,
      };
    } catch {
      return down;
    }
  }

  private async detail(response: Response): Promise<string> {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    return typeof body?.detail === 'string' ? body.detail.slice(0, 300) : response.statusText;
  }
}
