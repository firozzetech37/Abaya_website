import type { ImageDescriber } from '../application/ports/catalog.ports';

const TIMEOUT_MS = 20_000;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Gemini vision (text answer only), which the free Gemini key allows. Describes a reference
 * photo in a few words; any failure just leaves the note for the designer to write.
 */
export class GeminiImageDescriber implements ImageDescriber {
  readonly available = true;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async describe(
    image: { data: Buffer; mimeType: string },
    instruction: string,
  ): Promise<string | null> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: instruction },
                  { inlineData: { mimeType: image.mimeType, data: image.data.toString('base64') } },
                ],
              },
            ],
            // Thinking off: a thinking model would spend the small budget on reasoning and return nothing.
            generationConfig: { maxOutputTokens: 120, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as GeminiResponse;
      const text = body.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim();
      return text || null;
    } catch {
      return null;
    }
  }
}

/** No Gemini key: the designer writes the notes. */
export class NoImageDescriber implements ImageDescriber {
  readonly available = false;

  async describe(): Promise<string | null> {
    return null;
  }
}
