/**
 * Designer Studio (docs/apps/studio.md): AI design generation and Pinterest inspiration.
 * Designers are in-house staff. Pinterest pins are viewed only (link + official embed); a pin
 * image is never downloaded, stored or sent to the AI. The prompt filter is shared so the
 * form warns while typing and the API refuses the same things.
 */
import { z } from 'zod';
import { ABAYA_STYLES, type AbayaStyle } from './enums';

export const DESIGN_SOURCES = ['UPLOAD', 'AI_GENERATED'] as const;
export type DesignSource = (typeof DESIGN_SOURCES)[number];

export const GENERATION_STATUSES = ['QUEUED', 'RUNNING', 'DONE', 'FAILED'] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

/** The base choices offered in AI Design (free text keeps the list open; these are suggestions). */
export const GENERATION_CHOICES = {
  sleeve: ['Straight', 'Bell', 'Cuffed', 'Butterfly', 'Kimono', 'Balloon', 'Pleated'],
  fabric: ['Nida', 'Korean nida', 'Crepe', 'Chiffon', 'Linen', 'Jersey', 'Satin'],
  colour: ['Black', 'Navy', 'Emerald', 'Maroon', 'Beige', 'Dusty rose', 'Olive', 'Grey'],
  embroidery: ['None', 'Tone-on-tone', 'Gold zari', 'Pearl work', 'Stone work', 'Lace trim', 'Thread work'],
  closure: ['Closed', 'Open front', 'Buttons', 'Snaps', 'Zip', 'Belted'],
  length: ['Ankle', 'Floor', 'Midi'],
  occasion: ['Everyday', 'Work', 'Eid', 'Wedding', 'Travel', 'Evening'],
} as const;
export type GenerationChoiceKey = keyof typeof GENERATION_CHOICES;

const choice = z.string().trim().max(40).optional();

/** POST /v1/studio/generations */
export const generationBody = z.object({
  style: z.enum(ABAYA_STYLES),
  sleeve: choice,
  fabric: choice,
  colour: choice,
  embroidery: choice,
  closure: choice,
  length: choice,
  occasion: choice,
  prompt: z.string().trim().min(10).max(600),
  /** The designer's own sketch, uploaded with purpose DESIGN_SKETCH. */
  sketchPath: z.string().max(300).optional(),
  /** A Pinterest pin looked at for ideas (link only). */
  inspirationUrl: z.string().url().max(500).optional(),
});
export type GenerationBody = z.infer<typeof generationBody>;

/** POST /v1/studio/images/:id/design — make a draft design from a variation. */
export const designFromImageBody = z.object({
  name: z.string().trim().min(3).max(100),
  style: z.enum(ABAYA_STYLES),
  description: z.string().max(2000).optional(),
});

export const favouriteBody = z.object({ favourite: z.boolean() });

/** POST /v1/studio/pinterest/preview and saved inspiration. */
export const pinUrlBody = z.object({ url: z.string().trim().url().max(500), note: z.string().max(300).optional() });

// ───────────── Prompt filter ─────────────

/** Brands and designers we must not imitate (extend as needed). */
const BRANDS = [
  'gucci', 'prada', 'chanel', 'dior', 'louis vuitton', 'lv', 'versace', 'hermes', 'hermès', 'zara', 'h&m', 'shein',
  'balenciaga', 'fendi', 'burberry', 'valentino', 'givenchy', 'armani', 'dolce', 'gabbana', 'nike', 'adidas',
  'sabyasachi', 'manish malhotra', 'anita dongre', 'elie saab', 'zuhair murad', 'inayah', 'haute hijab', 'modanisa',
];
/** Asking for a specific real person's look. */
const PEOPLE = [/\bcelebrity\b/i, /\bworn by\b/i, /\bas worn\b/i, /\blike (?:the )?(?:one|abaya) (?:worn|seen)\b/i];
/** Asking to reproduce someone else's design. */
const COPYING = [/\bcopy\b/i, /\bexact(?:ly)?\b/i, /\breplica\b/i, /\bidentical\b/i, /\bclone\b/i, /\bknock-?off\b/i, /\bsame as\b/i, /\bdupe\b/i];
const LINKS = /(https?:\/\/|www\.|\.com\b|pinterest|pin\.it)/i;

export type PromptProblem = 'brand' | 'person' | 'copy' | 'link';

/** Problems in a prompt (empty: fine). Words, not a model: cheap and predictable. */
export function promptProblems(prompt: string): PromptProblem[] {
  const text = ` ${prompt.toLowerCase()} `;
  const out: PromptProblem[] = [];
  if (BRANDS.some((b) => new RegExp(`[^a-z]${b.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}[^a-z]`).test(text))) out.push('brand');
  if (PEOPLE.some((r) => r.test(prompt))) out.push('person');
  if (COPYING.some((r) => r.test(prompt))) out.push('copy');
  if (LINKS.test(prompt)) out.push('link');
  return out;
}

/** The text sent to the image model: the base choices, the designer's words, and house rules. */
export function buildGenerationPrompt(input: GenerationBody, styleLabel: string, withSketch: boolean): string {
  const parts = [
    `A single original ${styleLabel.toLowerCase()} abaya design, full length, front view, on a plain mannequin or dress form,`,
    'studio product photograph, soft even light, plain warm-beige background, modest, no face, no text, no logo.',
  ];
  const details: [string, string | undefined][] = [
    ['Fabric', input.fabric],
    ['Colour', input.colour],
    ['Sleeves', input.sleeve],
    ['Closure', input.closure],
    ['Embellishment', input.embroidery],
    ['Length', input.length],
    ['Occasion', input.occasion],
  ];
  const listed = details.filter(([, v]) => v && v !== 'None').map(([k, v]) => `${k}: ${v}`);
  if (listed.length) parts.push(`${listed.join('. ')}.`);
  parts.push(`Designer notes: ${input.prompt.trim()}`);
  if (withSketch) parts.push("Follow the shape and details of the attached sketch, which is the designer's own drawing.");
  return parts.join(' ');
}

export const isPinterestUrl = (url: string): boolean =>
  /^https:\/\/(?:[a-z]{2,3}\.)?pinterest\.(?:com|co\.uk|ca|com\.au|de|fr|es|it|jp|in)\/pin\/[\w-]+\/?/i.test(url) ||
  /^https:\/\/pin\.it\/[\w-]+\/?$/i.test(url);

// ───────────── Responses ─────────────

export interface GeneratedImageDto {
  id: string;
  url: string;
  favourite: boolean;
  /** The draft design made from it, if any. */
  designId: string | null;
}

export interface GenerationDto {
  id: string;
  status: GenerationStatus;
  prompt: string;
  options: Partial<Record<GenerationChoiceKey, string>> & { style: AbayaStyle };
  sketchUrl: string | null;
  inspirationUrl: string | null;
  provider: string;
  model: string;
  /** "test" until a real image model is configured (placeholder images). */
  mode: 'live' | 'test';
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  images: GeneratedImageDto[];
}

export interface StudioLimitsDto {
  mode: 'live' | 'test';
  model: string;
  dailyLimit: number;
  usedToday: number;
  imagesPerGeneration: number;
}

export interface PinPreviewDto {
  url: string;
  title: string | null;
  author: string | null;
  /** Shown straight from Pinterest (never copied to our storage). */
  imageUrl: string | null;
  providerUrl: string;
}

export interface PinterestBoardDto {
  id: string;
  name: string;
  pinCount: number | null;
  coverUrl: string | null;
}

export interface PinterestPinDto {
  id: string;
  title: string | null;
  url: string;
  imageUrl: string | null;
}

export interface StudioSummaryDto {
  byStatus: Partial<Record<'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'PRICED' | 'PUBLISHED' | 'ARCHIVED', number>>;
  /** Average hours from "submitted for review" to "approved". */
  averageApprovalHours: number | null;
  needsAttention: { id: string; name: string; reviewNotes: string | null; updatedAt: string }[];
  /** Paid orders of my designs. */
  orders: number;
  revenueInPaise: number;
  aiGenerationsToday: number;
  assignedReferences: number;
}
