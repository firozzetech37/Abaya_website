import type { AbayaStyle, AiMatchLevel, AiSuggestedTag } from '@abaya/contracts';

/**
 * Duplicate detection and suggestion rules (docs/adr/0005-ai-service.md). Plain TypeScript.
 *
 * Every analysed image has a unit-length CLIP vector: the cosine (dot product) of two
 * vectors is their visual similarity, 1 = identical. A 64-bit perceptual hash catches
 * exact copies (resized, recompressed) even when the design itself is common-looking.
 */

export interface MatchThresholds {
  /** At or above: likely duplicate. */
  duplicate: number;
  /** At or above: similar, worth a look. */
  similar: number;
  /** Perceptual-hash distance (0-64 bits) at or below which an image counts as the same picture. */
  hashDistance: number;
}

export const SAME_PICTURE_HASH_DISTANCE = 4;

export type SubjectKind = 'DESIGN_IMAGE' | 'REFERENCE';

/** What a match points at: a whole design (any of its images) or one reference. */
export type Owner = { kind: 'DESIGN'; id: string } | { kind: 'REFERENCE'; id: string };
export const ownerKey = (o: Owner) => `${o.kind}:${o.id}`;

export interface IndexedImage {
  kind: SubjectKind;
  subjectId: string;
  designId: string | null;
  vector: Float32Array;
  phash: string | null;
}

export const ownerOf = (image: Pick<IndexedImage, 'kind' | 'subjectId' | 'designId'>): Owner =>
  image.kind === 'DESIGN_IMAGE' ? { kind: 'DESIGN', id: image.designId ?? image.subjectId } : { kind: 'REFERENCE', id: image.subjectId };

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0; // vectors from different models are not comparable
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

/** Bits that differ between two 16-hex-character hashes; null when either is missing or malformed. */
export function hashDistance(a: string | null, b: string | null): number | null {
  if (!a || !b || !/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) return null;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let bits = 0;
  while (x > 0n) {
    bits += Number(x & 1n);
    x >>= 1n;
  }
  return bits;
}

export function classifyMatch(score: number, distance: number | null, t: MatchThresholds): AiMatchLevel | null {
  if (score >= t.duplicate) return 'DUPLICATE';
  // Same picture (hash) and at least similar-looking: a copy, maybe cropped or recoloured slightly.
  if (distance !== null && distance <= t.hashDistance && score >= t.similar) return 'DUPLICATE';
  if (score >= t.similar) return 'SIMILAR';
  return null;
}

export interface Match {
  owner: Owner;
  score: number;
  level: AiMatchLevel;
}

const rank = (m: Pick<Match, 'level' | 'score'>) => (m.level === 'DUPLICATE' ? 2 : 1) * 10 + m.score;

/**
 * Best match per design/reference for a set of source images (e.g. all images of one design),
 * strongest first. Images belonging to `exclude` (the design or reference itself) are skipped.
 */
export function findMatches(
  sources: IndexedImage[],
  candidates: Iterable<IndexedImage>,
  t: MatchThresholds,
  exclude: Owner,
  limit = 8,
): Match[] {
  const excluded = ownerKey(exclude);
  const best = new Map<string, Match>();
  for (const candidate of candidates) {
    const owner = ownerOf(candidate);
    const key = ownerKey(owner);
    if (key === excluded) continue;
    for (const source of sources) {
      const score = cosine(source.vector, candidate.vector);
      const level = classifyMatch(score, hashDistance(source.phash, candidate.phash), t);
      if (!level) continue;
      const current = best.get(key);
      if (!current || rank({ level, score }) > rank(current)) best.set(key, { owner, score: round(score), level });
    }
  }
  return [...best.values()].sort((a, b) => rank(b) - rank(a)).slice(0, limit);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ───────────── Background job retries ─────────────

/** Delays after the 1st, 2nd … failure. After the last one the image is marked FAILED. */
const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export function nextAttemptAfterFailure(failedAttempts: number, now: Date): Date | null {
  const delay = RETRY_DELAYS_MS[failedAttempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

// ───────────── Suggestions ─────────────

const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Never trust the AI service's output shape: keep well-formed tags only, once each. */
export function sanitizeTags(raw: unknown): AiSuggestedTag[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AiSuggestedTag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { tag, group, label, score } = item as Record<string, unknown>;
    if (typeof tag !== 'string' || tag.length > 30 || !TAG.test(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push({
      tag,
      group: typeof group === 'string' ? group.slice(0, 40) : 'other',
      label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 40) : tag,
      score: Math.round(clamp01(score) * 1000) / 1000,
    });
  }
  return out;
}

export interface ImageSuggestion {
  tags: AiSuggestedTag[];
  style: AbayaStyle | null;
  styleScore: number | null;
  altText: string | null;
  isPrimary: boolean;
}

export interface CombinedSuggestion {
  tags: AiSuggestedTag[];
  style: { value: AbayaStyle; score: number } | null;
  altText: string | null;
}

/**
 * One suggestion for a design from all its images: every tag seen on any image (best score),
 * the most confident style, and the primary image's alt text. Tags the design already has,
 * and a style it already uses, are left out. Null when nothing is left to suggest.
 */
export function combineSuggestions(
  images: ImageSuggestion[],
  current: { tags: string[]; style?: AbayaStyle },
): CombinedSuggestion | null {
  const have = new Set(current.tags.map((t) => t.toLowerCase()));
  const tags = new Map<string, AiSuggestedTag>();
  let style: CombinedSuggestion['style'] = null;
  for (const image of images) {
    for (const t of image.tags) {
      if (have.has(t.tag)) continue;
      const seen = tags.get(t.tag);
      if (!seen || t.score > seen.score) tags.set(t.tag, t);
    }
    if (image.style && (image.styleScore ?? 0) > (style?.score ?? -1)) {
      style = { value: image.style, score: image.styleScore ?? 0 };
    }
  }
  if (style && current.style === style.value) style = null;
  const primary = images.find((i) => i.isPrimary && i.altText) ?? images.find((i) => i.altText);
  const altText = primary?.altText ?? null;
  const sortedTags = [...tags.values()].sort((a, b) => b.score - a.score);
  if (sortedTags.length === 0 && !style && !altText) return null;
  return { tags: sortedTags, style, altText };
}

/** Tags after accepting suggestions: existing first, then new ones, no repeats, at most 15. */
export function mergeTags(existing: string[], added: string[], max = 15): string[] {
  const out: string[] = [];
  for (const tag of [...existing, ...added]) {
    const t = tag.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, max);
}
