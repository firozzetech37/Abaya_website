import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import type { PreviewChecker } from '../application/ports/try-on.ports';

/**
 * How long a customer may wait for Gemini: the photo check and the background wording are asked
 * while she waits, so at most 10 s. The accuracy check runs after she already has her try-on, so it
 * may take a little longer.
 */
const QUICK_TIMEOUT_MS = 10_000;
const CHECK_TIMEOUT_MS = 20_000;
/** After "quota used up" (429) Gemini says when to come back; we wait that long, at most an hour, at least 30 s. */
const MAX_PAUSE_MS = 60 * 60_000;
const MIN_PAUSE_MS = 30_000;
/** "Overloaded" (503) or no answer in time: skip Gemini for a while instead of making every customer wait again. */
export const BUSY_PAUSE_MS = 10 * 60_000;

/** `"retryDelay": "69000s"` (or the message's "retry in 19h10m0.1s") → milliseconds; null when absent. */
export function retryDelayMs(body: string): number | null {
  const seconds = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  if (seconds) return Math.round(Number(seconds[1]) * 1000);
  const text = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/.exec(body);
  if (text && (text[1] || text[2] || text[3])) return Math.round(((Number(text[1] ?? 0) * 60 + Number(text[2] ?? 0)) * 60 + Number(text[3] ?? 0)) * 1000);
  return null;
}

/** How long to stop asking Gemini after this answer (0: keep asking). */
export function pauseAfter(status: number, body: string): number {
  if (status === 429) return Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, retryDelayMs(body) ?? 10 * 60_000));
  if (status === 503) return BUSY_PAUSE_MS;
  return 0;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Gemini vision (text answer only, allowed on the free key) as the quality checker: it looks at
 * the original photo and the preview and says which checks pass. Any failure (no quota,
 * timeout, unreadable answer) returns null and the preview is shown unchecked.
 */
export class GeminiPreviewChecker implements PreviewChecker {
  readonly available = true;
  private readonly logger = new Logger('GeminiPreviewChecker');
  /**
   * While Gemini refuses (free daily quota used up, or overloaded) we stop asking until it says
   * to come back, so customers never wait seconds for a refusal: the check is simply skipped.
   */
  private pausedUntil = 0;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async check(images: { label: string; data: Buffer; mimeType: string }[], question: string, count: number, opts: { maxSide?: number } = {}) {
    if (this.paused()) return null;
    const sized = opts.maxSide ? await Promise.all(images.map(async (img) => ({ ...img, ...(await shrink(img.data, img.mimeType, opts.maxSide!)) }))) : images;
    const text = await this.ask(
      [
        { text: question },
        ...sized.flatMap((img) => [{ text: `${img.label}:` }, { inlineData: { mimeType: img.mimeType, data: img.data.toString('base64') } }]),
      ],
      800,
      CHECK_TIMEOUT_MS,
    );
    return text === null ? null : parseAnswers(text, count);
  }

  async classifyRequest(question: string) {
    const text = await this.ask([{ text: question }], 300, QUICK_TIMEOUT_MS);
    return text === null ? null : parseRequestVerdict(text);
  }

  /** Her photo is checked at PHOTO_CHECK_SIDE pixels: enough to see a whole person, a fraction of the upload. */
  async assessPhoto(photo: { data: Buffer; mimeType: string }, question: string) {
    if (this.paused()) return null;
    const small = await shrink(photo.data, photo.mimeType, PHOTO_CHECK_SIDE);
    const text = await this.ask([{ text: question }, { inlineData: { mimeType: small.mimeType, data: small.data.toString('base64') } }], 100, QUICK_TIMEOUT_MS);
    return text === null ? null : parsePhotoVerdict(text);
  }

  private paused(now = Date.now()) {
    return now < this.pausedUntil;
  }

  private async ask(parts: unknown[], maxOutputTokens: number, timeoutMs: number): Promise<string | null> {
    if (this.paused()) return null;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            // Thinking off: these are short JSON verdicts, and a thinking model would spend the
            // output budget on its reasoning and return a cut-off answer.
            generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (!res.ok) {
        const pause = pauseAfter(res.status, await res.text().catch(() => ''));
        if (pause > 0) {
          this.pausedUntil = Date.now() + pause;
          this.logger.warn(`Gemini answered ${res.status}; checks are skipped for ${Math.round(pause / 60_000)} min`);
        }
        return null;
      }
      const body = (await res.json()) as GeminiResponse;
      return body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? null;
    } catch (e) {
      // No answer in time: Gemini is struggling, so stop asking for a while.
      if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        this.pausedUntil = Date.now() + BUSY_PAUSE_MS;
        this.logger.warn(`Gemini did not answer within ${Math.round(timeoutMs / 1000)} s; checks are skipped for ${BUSY_PAUSE_MS / 60_000} min`);
      }
      return null;
    }
  }
}

/** The photo for the checker: at most `maxSide` pixels, as a JPEG (the original if it cannot be read). */
async function shrink(data: Buffer, mimeType: string, maxSide: number): Promise<{ data: Buffer; mimeType: string }> {
  try {
    const out = await sharp(data, { failOn: 'none' })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data: out, mimeType: 'image/jpeg' };
  } catch {
    return { data, mimeType };
  }
}

const PHOTO_CHECK_SIDE = 1024;

const unfence = (text: string) => text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');

/** `{"ok":false,"reason":"not_full_body"}` → the verdict (null if unusable). */
export function parsePhotoVerdict(text: string): { ok: boolean; reason: string } | null {
  try {
    const json = JSON.parse(unfence(text)) as { ok?: unknown; reason?: unknown };
    return typeof json.ok === 'boolean' ? { ok: json.ok, reason: typeof json.reason === 'string' ? json.reason : '' } : null;
  } catch {
    return null;
  }
}

/** `{"results":[{"n":1,"ok":true,"problem":""}]}` → one answer per check, in order (null if unusable). */
export function parseAnswers(text: string, count: number): { ok: boolean; problem: string }[] | null {
  try {
    const json = JSON.parse(unfence(text)) as {
      results?: { n?: number; ok?: unknown; problem?: unknown }[];
    };
    const results = json.results ?? [];
    const answers = Array.from({ length: count }, (_, i) => {
      const r = results.find((x) => x.n === i + 1) ?? results[i];
      return r && typeof r.ok === 'boolean' ? { ok: r.ok, problem: typeof r.problem === 'string' ? r.problem : '' } : null;
    });
    return answers.every((a) => a) ? (answers as { ok: boolean; problem: string }[]) : null;
  } catch {
    return null;
  }
}

/** No Gemini key: previews are shown without the check. */
export class NoPreviewChecker implements PreviewChecker {
  readonly available = false;
  async check() {
    return null;
  }
  async classifyRequest() {
    return null;
  }
  async assessPhoto() {
    return null;
  }
}

/** `{"kept": "...", "leftOut": ["..."]}`; anything unreadable counts as "could not tell". */
export function parseRequestVerdict(text: string): { kept: string; leftOut: string[] } | null {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { kept?: unknown; leftOut?: unknown };
    if (typeof parsed.kept !== 'string') return null;
    const leftOut = Array.isArray(parsed.leftOut) ? parsed.leftOut.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
    return { kept: parsed.kept.trim().replace(/\s+/g, ' '), leftOut };
  } catch {
    return null;
  }
}
