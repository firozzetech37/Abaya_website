import { Injectable } from '@nestjs/common';
import { type ImageGenerator, PermanentGenerationError } from '../application/ports/studio.ports';

const GENERATE_TIMEOUT_MS = 90_000;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

/**
 * Nano Banana (Gemini image model) over the public REST API. One image per call; the sketch,
 * when there is one, goes with the text. The key is sent in a header, never in the URL.
 */
@Injectable()
export class GeminiImageGenerator implements ImageGenerator {
  readonly provider = 'gemini';
  readonly live = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async generate(request: Parameters<ImageGenerator['generate']>[0]) {
    const parts: GeminiPart[] = [{ text: `${request.prompt} (Variation ${request.variation}.)` }];
    if (request.sketch) {
      parts.push({ inlineData: { mimeType: request.sketch.mimeType, data: request.sketch.data.toString('base64') } });
    }
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      });
    } catch (e) {
      throw new Error(`Image model unreachable (${e instanceof Error ? e.message : String(e)})`);
    }
    const body = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404) {
      throw new PermanentGenerationError(`Image model refused the request (${response.status} ${body.error?.status ?? ''})`.trim());
    }
    if (!response.ok) throw new Error(`Image model error ${response.status}`);
    if (body.promptFeedback?.blockReason) throw new PermanentGenerationError(`blocked: ${body.promptFeedback.blockReason}`);

    const image = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!image?.data) {
      const reason = body.candidates?.[0]?.finishReason;
      if (reason && /SAFETY|PROHIBITED|BLOCK/i.test(reason)) throw new PermanentGenerationError(`blocked: ${reason}`);
      throw new Error('The image model returned no image');
    }
    const mimeType = image.mimeType === 'image/jpeg' ? 'image/jpeg' : image.mimeType === 'image/webp' ? 'image/webp' : 'image/png';
    return { data: Buffer.from(image.data, 'base64'), mimeType } as const;
  }
}
