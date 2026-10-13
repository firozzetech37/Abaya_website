/**
 * Picks the catalog texts out of an API response (by field name, at any depth) and puts their
 * translations back. A description written as "Key : Value" pairs is translated pair by pair
 * and rebuilt one pair per line, so the site still shows it as a details list.
 */
import { parseDescriptionSpecs } from '@abaya/contracts';

type Json = unknown;

const isRecord = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every text to translate in `body` for these field names. */
export function textsToTranslate(body: Json, keys: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const visit = (v: Json) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!isRecord(v)) return;
    for (const [k, child] of Object.entries(v)) {
      if (keys.has(k) && typeof child === 'string') {
        const specs = k === 'description' ? parseDescriptionSpecs(child) : null;
        if (specs) for (const s of specs) out.push(s.label, s.value);
        else out.push(child);
      } else {
        visit(child);
      }
    }
  };
  visit(body);
  return out;
}

/** A copy of `body` with those fields translated (texts without a translation stay as they are). */
export function applyTranslations(body: Json, keys: ReadonlySet<string>, translated: ReadonlyMap<string, string>): Json {
  const t = (s: string) => translated.get(s) ?? s;
  const visit = (v: Json): Json => {
    if (Array.isArray(v)) return v.map(visit);
    if (!isRecord(v)) return v;
    const copy: Record<string, Json> = {};
    for (const [k, child] of Object.entries(v)) {
      if (keys.has(k) && typeof child === 'string') {
        const specs = k === 'description' ? parseDescriptionSpecs(child) : null;
        copy[k] = specs ? specs.map((s) => `${t(s.label)}: ${t(s.value)}`).join('\n') : t(child);
      } else {
        copy[k] = visit(child);
      }
    }
    return copy;
  };
  return visit(body);
}
