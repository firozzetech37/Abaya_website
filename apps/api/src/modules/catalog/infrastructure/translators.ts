import type { Translator } from '../application/ports/catalog.ports';

const TIMEOUT_MS = 15_000;

/** Gemini (free tier): the best Arabic for marketing copy; used when GEMINI_API_KEY is set. */
export class GeminiTranslator implements Translator {
  readonly provider = 'gemini' as const;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async toArabic(text: string): Promise<string> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  'Translate this short website banner for a modest-wear (abaya) boutique into natural, elegant Modern Standard Arabic addressed to women customers. ' +
                  'Keep it short, keep brand names and numbers as they are, no quotes, no explanation. Reply with the Arabic sentence only.\n\n' +
                  text,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Gemini answered ${res.status}`);
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const out = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim().replace(/^["“]|["”]$/g, '');
    if (!out) throw new Error('Gemini gave no translation');
    return out;
  }

  /** One call for many short catalog texts: a JSON array in, a JSON array out, same order. Busy answers are retried. */
  async toArabicMany(texts: string[]): Promise<string[]> {
    if (texts.length === 0) return [];
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.batchOnce(texts);
      } catch (e) {
        const busy = e instanceof Error && /answered (429|500|502|503|504)/.test(e.message);
        if (!busy || attempt >= 2) throw e;
        await new Promise((r) => setTimeout(r, attempt === 0 ? 1_500 : 5_000));
      }
    }
  }

  private async batchOnce(texts: string[]): Promise<string[]> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  'Translate each item of this JSON array into natural, elegant Modern Standard Arabic for a luxury abaya (modest-wear) boutique website. ' +
                  'Items are product names, collection names, fabric, colour and style names, care details and short descriptions. ' +
                  'Translate every word (fabric and colour names too, e.g. "Nida" → "ندى", "Crepe" → "كريب"; unit words too, e.g. "cm" → "سم", "inch" → "إنش"); keep the numbers as they are. ' +
                  'Answer with a JSON array of strings only, the same length and order.\n\n' +
                  JSON.stringify(texts),
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (!res.ok) throw new Error(`Gemini answered ${res.status}`);
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const parsed = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== texts.length) throw new Error('Gemini gave a different number of translations');
    return parsed.map((x) => (typeof x === 'string' ? x : ''));
  }
}

/** MyMemory (free, no key, a few thousand characters a day): a rougher draft when there is no Gemini key. */
export class MyMemoryTranslator implements Translator {
  readonly provider = 'mymemory' as const;

  async toArabic(text: string): Promise<string> {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ar`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Translation service answered ${res.status}`);
    const body = (await res.json()) as { responseStatus?: number; responseData?: { translatedText?: string } };
    const out = body.responseData?.translatedText?.trim();
    if (body.responseStatus !== 200 || !out) throw new Error('Translation service gave no translation');
    return out;
  }

  async toArabicMany(texts: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const t of texts) out.push(await this.toArabic(t));
    return out;
  }
}

/** Tests: a predictable draft, no network. */
export class TestTranslator implements Translator {
  readonly provider = 'test' as const;
  toArabic(text: string): Promise<string> {
    return Promise.resolve(`[ar] ${text}`);
  }
  toArabicMany(texts: string[]): Promise<string[]> {
    return Promise.resolve(texts.map((t) => `[ar] ${t}`));
  }
}

/** Gemini first; if it still fails (quota, outage), MyMemory makes a rougher draft so the site is not left in English. */
export class FallbackTranslator implements Translator {
  readonly provider: Translator['provider'];
  constructor(
    private readonly primary: Translator,
    private readonly secondary: Translator,
  ) {
    this.provider = primary.provider;
  }

  toArabic(text: string): Promise<string> {
    return this.primary.toArabic(text).catch(() => this.secondary.toArabic(text));
  }

  toArabicMany(texts: string[]): Promise<string[]> {
    return this.primary.toArabicMany(texts).catch(() => this.secondary.toArabicMany(texts));
  }
}
