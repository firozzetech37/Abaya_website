import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { TRANSLATOR, type Translator } from './ports/catalog.ports';

/** Port: translations already made, by language and a hash of the English text. */
export interface ContentTranslationRepository {
  find(lang: string, hashes: string[]): Promise<Map<string, string>>;
  save(lang: string, rows: { hash: string; source: string; text: string }[]): Promise<void>;
}
export const CONTENT_TRANSLATION_REPOSITORY = Symbol('CONTENT_TRANSLATION_REPOSITORY');

export const SUPPORTED_CONTENT_LANGS = ['ar'] as const;
export type ContentLang = (typeof SUPPORTED_CONTENT_LANGS)[number];

const BATCH = 20;
/** After a failed batch (quota, network), wait this long before trying again. */
const COOL_DOWN_MS = 60_000;

const hashOf = (text: string) => createHash('sha1').update(text).digest('hex');
/** Worth translating: has letters, is not a code, a URL or a number. */
const translatable = (text: string) => /[A-Za-z]{2,}/.test(text) && !/^https?:\/\//.test(text) && text.length <= 2000;

/**
 * Catalog text for the Arabic site (design and collection names, descriptions, fabric and
 * colour names). Translations are made once (Gemini, else MyMemory) and stored; requests read the
 * store, wait a moment for anything new, and otherwise show English while it is translated in the
 * background. Nothing a customer typed goes through here.
 */
@Injectable()
export class ContentTranslationService {
  private readonly logger = new Logger(ContentTranslationService.name);
  private readonly queue = new Map<string, Set<string>>();
  private running: Promise<void> | null = null;
  private pausedUntil = 0;

  constructor(
    @Inject(CONTENT_TRANSLATION_REPOSITORY) private readonly repo: ContentTranslationRepository,
    @Inject(TRANSLATOR) private readonly translator: Translator,
  ) {}

  /**
   * The translations of `texts` (English source → translation). Anything not translated yet is
   * queued; when `waitMs` is set the call waits up to that long for the queue to catch up.
   */
  async translate(texts: string[], lang: ContentLang, waitMs = 0): Promise<Map<string, string>> {
    const wanted = [...new Set(texts.filter(translatable))];
    const found = await this.lookup(wanted, lang);
    const missing = wanted.filter((t) => !found.has(t));
    if (missing.length === 0) return found;
    this.enqueue(missing, lang);
    if (waitMs > 0 && this.running) {
      await Promise.race([this.running, new Promise((r) => setTimeout(r, waitMs))]);
      for (const [k, v] of await this.lookup(missing, lang)) found.set(k, v);
    }
    return found;
  }

  /** Queue texts for translation without waiting (start-up warm-up, after a catalog change). */
  warm(texts: string[], lang: ContentLang): void {
    void this.translate(texts, lang).catch(() => undefined);
  }

  private async lookup(texts: string[], lang: string): Promise<Map<string, string>> {
    if (texts.length === 0) return new Map();
    const byHash = await this.repo.find(lang, texts.map(hashOf));
    const out = new Map<string, string>();
    for (const t of texts) {
      const hit = byHash.get(hashOf(t));
      if (hit) out.set(t, hit);
    }
    return out;
  }

  private enqueue(texts: string[], lang: string): void {
    const set = this.queue.get(lang) ?? new Set<string>();
    for (const t of texts) set.add(t);
    this.queue.set(lang, set);
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
  }

  private async drain(): Promise<void> {
    for (;;) {
      if (Date.now() < this.pausedUntil) return;
      const [lang, set] = [...this.queue.entries()].find(([, s]) => s.size > 0) ?? [];
      if (!lang || !set) return;
      const batch = [...set].slice(0, BATCH);
      for (const t of batch) set.delete(t);
      try {
        const out = await this.translator.toArabicMany(batch);
        const rows = batch.flatMap((source, i) => {
          const text = out[i]?.trim();
          return text && text !== source ? [{ hash: hashOf(source), source, text }] : [];
        });
        await this.repo.save(lang, rows);
      } catch (e) {
        // Quota or network: put them back and pause; the next request or warm-up tries again.
        for (const t of batch) set.add(t);
        this.pausedUntil = Date.now() + COOL_DOWN_MS;
        this.logger.warn({ err: e instanceof Error ? e.message : e, count: batch.length }, 'Catalog translation paused');
        return;
      }
    }
  }
}
