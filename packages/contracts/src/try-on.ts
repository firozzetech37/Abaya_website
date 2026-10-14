/**
 * Customer AI previews on the website (docs/apps/web.md "AI preview and try-on"):
 * - PREVIEW: one FASHN edit of the design photo showing the customer's chosen options.
 *   Shared: the same design + options is made once and then reused by everyone, free.
 * - TRYON: FASHN try-on of the abaya (or her preview) on a photo of the customer.
 *   Private to her, deleted after TRYON_RETENTION_DAYS. Staff never see try-ons.
 * The order is always made from the chosen options, never from a picture.
 */
import { z } from 'zod';
import type { OptionGroupCode } from './enums';

export const CUSTOMER_PREVIEW_KINDS = ['PREVIEW', 'TRYON'] as const;
export type CustomerPreviewKind = (typeof CUSTOMER_PREVIEW_KINDS)[number];

export const CUSTOMER_PREVIEW_STATUSES = ['QUEUED', 'RUNNING', 'DONE', 'FAILED'] as const;
export type CustomerPreviewStatus = (typeof CUSTOMER_PREVIEW_STATUSES)[number];

/** FASHN credits per request at 1K fast (the website always uses 1K fast). */
export const CUSTOMER_PREVIEW_CREDITS: Record<CustomerPreviewKind, number> = { PREVIEW: 1, TRYON: 1 };
/** Defaults; the API reads its limits from the environment. */
export const DEFAULT_PREVIEWS_PER_DAY = 5;
export const DEFAULT_TRYONS_PER_DAY = 3;
export const DEFAULT_CUSTOMER_AI_CREDITS_PER_DAY = 200;
/** Try-on photos and results are deleted this many days after they were made. */
export const TRYON_RETENTION_DAYS = 30;

const uuid = z.string().uuid();

/** POST /v1/me/try-on/previews */
/** Free words a customer may add to a preview: fabric look, colour, background, lighting or mood only. */
export const PREVIEW_REQUEST_MAX = 200;
export const createCustomerPreviewBody = z.object({
  designId: uuid,
  selectedOptionValueIds: z.array(uuid).max(20),
  /** "In your words": checked by the API before it reaches the image model; never a design change. */
  request: z.string().trim().max(PREVIEW_REQUEST_MAX).optional(),
});
export type CreateCustomerPreviewBody = z.infer<typeof createCustomerPreviewBody>;

/** POST /v1/me/try-on/uploads: where to PUT her photo (private bucket). */
export const tryOnUploadBody = z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) });

/** POST /v1/me/try-on/try-ons */
/**
 * "Try it on" works two ways: on her own photo, or on a model with her build ("a model like
 * me", made by the AI from her measurements, no photo needed).
 */
export const TRYON_MODES = ['PHOTO', 'MODEL'] as const;
export type TryOnMode = (typeof TRYON_MODES)[number];

/**
 * Her measurements for a try-on (same limits as a saved measurement profile). Used only to make
 * that picture: never saved to her profile, and the picture is deleted after its hour. Weight is
 * optional and only shapes the build of the model ("a model like me").
 */
export const tryOnBodyInput = z.object({
  heightCm: z.number().int().min(120).max(210),
  weightKg: z.number().int().min(30).max(200).optional(),
  bustCm: z.number().int().min(60).max(170).optional(),
  waistCm: z.number().int().min(50).max(160).optional(),
  hipCm: z.number().int().min(60).max(180).optional(),
  sleeveLengthCm: z.number().int().min(40).max(85).optional(),
  /** Shoulder to floor: the length her abaya is cut to. */
  fullLengthCm: z.number().int().min(100).max(175).optional(),
});
export type TryOnBody = z.infer<typeof tryOnBodyInput>;

/** Ready-made backgrounds for a try-on (her own photo's background is kept when none is chosen). */
export const TRYON_BACKGROUNDS = ['studio', 'courtyard', 'desert', 'marble', 'garden', 'skyline'] as const;
export type TryOnBackground = (typeof TRYON_BACKGROUNDS)[number];
/** The longest background she may describe in her own words. */
export const TRYON_BACKGROUND_TEXT_MAX = 120;

export const createTryOnBody = z
  .object({
    designId: uuid,
    mode: z.enum(TRYON_MODES).default('PHOTO'),
    /** PHOTO: her photo, uploaded through POST /v1/me/try-on/uploads. */
    personPath: z.string().min(1).max(300).optional(),
    /** MODEL: required (at least her height). PHOTO: optional, to show the made-to-measure length and sleeves. */
    body: tryOnBodyInput.optional(),
    /** Wear her customised preview (must be a finished preview of this design). */
    previewId: uuid.optional(),
    /** Otherwise the design photo of this colour (or the main photo). */
    colourValueId: uuid.optional(),
    /**
     * PHOTO, from her saved measurements: her figure, described in the instruction so the abaya is
     * fitted to her (no extra AI step, unlike `body`, which adds the made-to-measure edit).
     */
    figure: tryOnBodyInput.optional(),
    /** A ready-made background instead of her photo's own. */
    backgroundPreset: z.enum(TRYON_BACKGROUNDS).optional(),
    /** Or a background in her own words (checked first: only a place, light or mood). */
    backgroundText: z.string().trim().min(3).max(TRYON_BACKGROUND_TEXT_MAX).optional(),
    /** She agrees her photo or measurements are sent to our AI provider to make this picture. */
    consent: z.literal(true),
  })
  .superRefine((b, ctx) => {
    if (b.backgroundPreset && b.backgroundText) ctx.addIssue({ code: 'custom', path: ['backgroundText'], message: 'Choose one background' });
    if (b.mode === 'PHOTO' && !b.personPath) ctx.addIssue({ code: 'custom', path: ['personPath'], message: 'Choose a photo of yourself' });
    if (b.mode === 'MODEL' && !b.body) ctx.addIssue({ code: 'custom', path: ['body'], message: 'Enter at least your height' });
  });
export type CreateTryOnBody = z.infer<typeof createTryOnBody>;

/** PATCH /v1/admin/customer-previews/:id */
export const hideCustomerPreviewBody = z.object({ hidden: z.boolean() });

export interface CustomerPreviewDto {
  id: string;
  kind: CustomerPreviewKind;
  designId: string;
  status: CustomerPreviewStatus;
  /** Short-lived link to the result once DONE. */
  imageUrl: string | null;
  error: string | null;
  createdAt: string;
  /** When it disappears for her (an hour after she got it); null for a picture she has no access to. */
  expiresAt: string | null;
  /** Previews made from her own words (the chosen options were not used for the picture). */
  fromWords: boolean;
  /** Parts of her wish that were left out because they would change the design. */
  leftOut: string[];
  /** A try-on of her customised version (made on her AI preview), not the abaya as photographed. */
  customised: boolean;
}

export interface CustomerAiLimitsDto {
  previewsLeft: number;
  previewsPerDay: number;
  tryOnsLeft: number;
  tryOnsPerDay: number;
  /** False when the shop's daily AI budget is used up. */
  available: boolean;
  /** False in test mode (no FASHN key): results are placeholders. */
  live: boolean;
  /** True when "in your words" requests can be checked (a Gemini key is set); the box is hidden otherwise. */
  wording: boolean;
  /** Each AI picture is hers to see for this many minutes after she got it, then deleted. */
  keepMinutes: number;
}

export interface AdminCustomerPreviewDto {
  id: string;
  design: { id: string; name: string; slug: string };
  /** The chosen options, as "Group: Value". */
  choices: string[];
  status: CustomerPreviewStatus;
  imageUrl: string | null;
  hidden: boolean;
  credits: number;
  /** Remade once after the accuracy check found problems. */
  retries: number;
  /** "Checked", "Not checked", or the problems the accuracy check found. */
  checkNotes: string | null;
  /** When the picture was deleted because the customer was inactive; null while it exists. */
  purgedAt: string | null;
  createdAt: string;
}

export interface AdminCustomerPreviewSummaryDto {
  previewsToday: number;
  tryOnsToday: number;
  creditsToday: number;
  dailyCreditLimit: number;
  live: boolean;
}

// ───────────── Prompt plan (docs/apps/web.md "AI preview and try-on") ─────────────

export interface PreviewChoice {
  group: OptionGroupCode;
  name: string;
  description?: string | null;
}

/** Choices no photo can show (inside the abaya or hidden): never sent to the AI. */
const INVISIBLE = /\b(hidden|inner|inside|slip|lining|lined|snaps?|pocket|interfacing|label)\b/i;
export const isVisibleChoice = (c: PreviewChoice): boolean => !INVISIBLE.test(`${c.name} ${c.description ?? ''}`);

/** Key of a shared preview: the design and its chosen options, in a stable order. */
export const normaliseRequest = (request?: string | null): string => (request ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
/** Her words make the picture on their own, so a wish is keyed by the design + words, not the options. */
export const previewKey = (designId: string, optionValueIds: string[], request?: string | null): string => {
  const words = normaliseRequest(request);
  return words ? `${designId}:words:${words}` : `${designId}:${[...new Set(optionValueIds)].sort().join(',')}`;
};

const detail = (c: PreviewChoice) => (c.description ? ` (${c.description.trim().replace(/\.$/, '')})` : '');

/** One add-on as a clear instruction; matching hijab or shayla replaces the one she wears. */
function addOnLine(c: PreviewChoice, colour: string): string {
  const name = c.name.toLowerCase();
  if (/shayla|hijab|scarf|headscarf/.test(name)) {
    return `replace her headscarf with a ${name.replace(/^matching\s+/, '')} in the same ${colour} colour and fabric as the abaya, worn the same way`;
  }
  if (/belt/.test(name)) return `add a ${name.replace(/^matching\s+/, '')} in the same ${colour} abaya fabric, tied at the waist${detail(c)}`;
  return `add a ${name}${detail(c)}`;
}

export interface PreviewPlan {
  /** One FASHN edit per step, each starting from the previous result. */
  steps: string[];
  /** What the finished picture must show; `critical` ones must all pass the check. */
  checks: { text: string; critical: boolean }[];
}

/**
 * The customer's version of a design in at most two careful edits:
 * 1. colour, fabric and embroidery colour only; 2. the visible details (sleeves, embroidery, closure, add-ons).
 * Every step protects the design's own silhouette and embroidery, which made the first
 * version redraw the whole garment. Choices nobody can see (inner slip, hidden snaps) are left out.
 */
export function planPreview(input: { style: string; colourName: string; choices: PreviewChoice[]; request?: string | null }): PreviewPlan {
  const request = (input.request ?? '').trim().replace(/\s+/g, ' ');
  const style = input.style.toLowerCase().replace(/_/g, ' ');
  // Her own words drive the picture alone: the chosen options only drive the order and price.
  const visible = request ? [] : input.choices.filter(isVisibleChoice);
  const colour = visible.find((c) => c.group === 'COLOUR');
  const fabric = visible.find((c) => c.group === 'FABRIC');
  const pattern = visible.find((c) => c.group === 'PATTERN_COLOUR');
  const details = visible.filter((c) => c.group !== 'COLOUR' && c.group !== 'FABRIC' && c.group !== 'PATTERN_COLOUR');
  const colourName = (colour?.name ?? input.colourName).toLowerCase();

  const keepDesign =
    `Keep the abaya's ${style} silhouette, cut, length and drape exactly as in the photo. ` +
    `Keep every existing embroidery panel, border, motif and trim exactly where it is: same position, size and pattern${pattern ? '' : ' and thread colour'}. Do not remove, simplify, move or redraw any of it.`;
  const keepScene = 'Keep the same woman, face, pose, background, lighting and framing.';
  const real = 'It must look like a real photograph: natural folds, real fabric texture, no invented patterns or text.';

  const steps: string[] = [];
  if (colour || fabric || pattern || request) {
    const asks = [
      colour ? `change the abaya's base fabric colour to ${colour.name}${detail(colour)}` : null,
      fabric ? `make the abaya fabric look like ${fabric.name}${detail(fabric)}, with that fabric's natural sheen and weight but the same shape` : null,
      pattern
        ? `recolour ALL the embroidery, borders, motifs and trim to ${pattern.name.toLowerCase()} thread${detail(pattern)}, keeping every pattern exactly in place at the same size`
        : null,
      request ? `follow the customer's wish exactly: "${request}"` : null,
    ].filter(Boolean);
    const only = request
      ? 'what the wish asks for: the fabric look, colours (including the embroidery thread colour if asked), background, setting, lighting or mood'
      : pattern
        ? colour || fabric
          ? 'the base fabric and the embroidery thread colour'
          : 'the embroidery thread colour'
        : 'the base fabric';
    const scene = request ? 'Keep the same woman, face, pose and framing; the background and lighting change only as the wish asks.' : `Keep her headscarf as it is. ${keepScene}`;
    steps.push(`Edit this photo: ${asks.join(', and ')}. Change ONLY ${only}. ${keepDesign} ${scene} ${real}`);
  }
  if (details.length > 0) {
    const asks = details.map((c) => {
      if (c.group === 'ADD_ON') return addOnLine(c, colourName);
      if (c.group === 'SLEEVE') return `give the sleeves a ${c.name.toLowerCase()} finish${detail(c)}, applied to the existing sleeves without changing the overall ${style} shape`;
      if (c.group === 'EMBELLISHMENT') return `add ${c.name.toLowerCase()}${detail(c)}, in addition to the existing embroidery`;
      if (c.group === 'CLOSURE') return `show a ${c.name.toLowerCase()} front closure${detail(c)}`;
      return `${c.name}${detail(c)}`;
    });
    steps.push(`Edit this photo: ${asks.join('; ')}. Change ONLY these details. Keep the abaya's ${colourName} colour and fabric. ${keepDesign} ${keepScene} ${real}`);
  }

  const checks: PreviewPlan['checks'] = [
    { text: `The abaya keeps the same ${style} silhouette, cut and length as in the original photo.`, critical: true },
    { text: 'Every embroidery panel or pattern visible on the original abaya is still there, in the same place and size, with the same motif.', critical: true },
  ];
  if (colour) checks.push({ text: `The abaya's main fabric colour is ${colour.name}.`, critical: true });
  if (pattern) checks.push({ text: `The embroidery, borders and motifs are ${pattern.name} in colour, with their original pattern.`, critical: true });
  if (request) checks.push({ text: `The customer's wish is followed: ${request}.`, critical: false });
  if (fabric) checks.push({ text: `The fabric looks like ${fabric.name}.`, critical: false });
  for (const c of details) {
    if (c.group === 'ADD_ON') checks.push({ text: `This is visible: ${addOnLine(c, colourName)}.`, critical: false });
    else checks.push({ text: `The ${c.group.toLowerCase().replace('_', ' ')} shows: ${c.name}.`, critical: false });
  }
  return { steps, checks };
}

/** Added to every step when the first attempt failed the check. */
export const fixInstruction = (problems: string[]): string =>
  `IMPORTANT, the previous attempt was wrong: ${problems.join(' ')} Fix this.`;

/** GET /v1/admin/customer-previews */
export const adminCustomerPreviewsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  /** Only the previews this customer asked for (from the "Credits by customer" table). */
  userId: z.string().uuid().optional(),
});

/** Her recent AI pictures of one design (the strip under the AI studio). */
export const recentAiPicturesQuery = z.object({ designId: uuid });
export interface RecentAiPicturesDto {
  /** Newest first: previews and try-ons she still has, each with the time it disappears. */
  items: CustomerPreviewDto[];
}

/** One of her AI pictures on her profile ("My AI pictures"), with the abaya it shows. */
export interface MyAiPictureDto extends CustomerPreviewDto {
  /** Null when the abaya is no longer on the website. */
  design: { name: string; slug: string } | null;
}
/** GET /v1/me/try-on/mine: every preview and try-on she can still see, from every abaya, newest first. */
export interface MyAiPicturesDto {
  items: MyAiPictureDto[];
}

// ───────────── Try-on with her measurements ─────────────

/** Her build in words, for the AI (no weight in kilograms is ever written down). */
export function bodyBuild(b: TryOnBody): { height: string; build: string; shape: string | null } {
  const h = b.heightCm;
  const height = h < 152 ? 'petite' : h < 163 ? 'of average height' : h < 172 ? 'tall' : 'very tall';
  let build: string;
  if (b.weightKg) {
    const bmi = b.weightKg / (h / 100) ** 2;
    build = bmi < 18.5 ? 'a very slim build' : bmi < 22 ? 'a slim build' : bmi < 25 ? 'a medium build' : bmi < 29 ? 'a full, curvy build' : bmi < 34 ? 'a plus-size build' : 'a full-figured plus-size build';
  } else if (b.hipCm) {
    build = b.hipCm < 92 ? 'a slim build' : b.hipCm < 104 ? 'a medium build' : b.hipCm < 116 ? 'a full, curvy build' : 'a plus-size build';
  } else {
    build = 'a medium build';
  }
  let shape: string | null = null;
  if (b.waistCm && b.hipCm) {
    const curve = b.hipCm - b.waistCm;
    shape = curve >= 25 ? 'a defined waist and full hips (hourglass)' : curve >= 15 ? 'gentle curves' : 'a straight, less defined waist';
  }
  if (b.bustCm && b.hipCm && b.bustCm - b.hipCm >= 8) shape = 'a fuller bust and narrower hips';
  return { height, build, shape };
}

/** model-create: an everyday woman with her build, in a plain base outfit and hijab, full length. */
export function modelLikeMePrompt(b: TryOnBody): string {
  const { height, build, shape } = bodyBuild(b);
  return [
    `Full-length studio photo of a realistic everyday woman (not a celebrity, not a fashion model), about ${b.heightCm} cm tall, ${height}, with ${build}${shape ? ` and ${shape}` : ''}.`,
    'Her body proportions must match this description exactly: do not make her slimmer, taller or curvier than described.',
    'She wears a plain fitted black long-sleeve base dress, a plain black hijab covering all her hair, and plain black flat shoes.',
    'Standing straight facing the camera, arms relaxed at her sides, calm natural expression.',
    'Plain light warm-grey studio background, soft even light. Full body from head to toe with space above her head and below her feet. No jewellery, no text, no logo.',
  ].join(' ');
}

/**
 * edit, after a try-on on her photo: the abaya as it will be made for her (cut to her full
 * length, sleeves to her wrists), without touching anything else.
 */
export function madeToMeasurePrompt(b: TryOnBody, style: string): string {
  const shape = style.toLowerCase().replace(/_/g, ' ');
  const petite = b.heightCm < 155;
  return [
    `Edit this photo: show the ${shape} abaya as it is tailored to her own measurements.`,
    `Adjust ONLY its length and sleeves: the hem falls just above the floor, covering her ankles${petite ? ', with no extra fabric pooling on the floor (she is petite)' : ''}, and the sleeves end exactly at her wrists.`,
    `Keep her face, body, pose, hands, headscarf or hair, and the background exactly the same. Keep the abaya's ${shape} silhouette, fabric, colour and every embroidery panel, border and motif exactly in place.`,
    'It must look like a real photograph: natural folds and drape.',
  ].join(' ');
}
