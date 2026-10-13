/**
 * AI Catalog (docs/apps/studio.md "AI Catalog"): on-model catalog photos of an abaya made with
 * FASHN (tryon-max, model-create, edit, reframe, background-remove). The abaya photo is the
 * source of truth for the garment; the approved master is the source of truth for the model,
 * styling and background; every pose and edit starts from it. The prompt builder lives here so
 * the designer sees (and may edit) the exact prompt before it is sent.
 */
import { z } from 'zod';
import { ABAYA_STYLES, type AbayaStyle } from './enums';

// ───────────── Settings and costs ─────────────

export const CATALOG_RESOLUTIONS = ['1k', '2k', '4k'] as const;
export type CatalogResolution = (typeof CATALOG_RESOLUTIONS)[number];
export const CATALOG_MODES = ['fast', 'balanced', 'quality'] as const;
export type CatalogMode = (typeof CATALOG_MODES)[number];
export const CATALOG_ASPECT_RATIOS = ['4:5', '3:4', '2:3', '9:16', '1:1', '16:9'] as const;
export type CatalogAspectRatio = (typeof CATALOG_ASPECT_RATIOS)[number];

/** Preview first; 4K quality only for an approved image. */
export const CATALOG_PRESETS = {
  PREVIEW: { resolution: '2k', mode: 'balanced' },
  FINAL: { resolution: '4k', mode: 'quality' },
} as const satisfies Record<string, { resolution: CatalogResolution; mode: CatalogMode }>;

/** FASHN credits per output image (docs.fashn.ai, same table for every image endpoint). */
const CREDIT_TABLE: Record<CatalogMode, Record<CatalogResolution, number>> = {
  fast: { '1k': 1, '2k': 2, '4k': 3 },
  balanced: { '1k': 2, '2k': 3, '4k': 4 },
  quality: { '1k': 3, '2k': 4, '4k': 5 },
};
/** A face reference costs 3 more credits per image. */
export const FACE_REFERENCE_CREDITS = 3;

export function creditCost(input: {
  kind: CatalogJobKind;
  resolution: CatalogResolution;
  mode: CatalogMode;
  numImages: number;
  faceReference?: boolean;
}): number {
  if (input.kind === 'BACKGROUND_REMOVE') return input.numImages;
  const each = CREDIT_TABLE[input.mode][input.resolution] + (input.faceReference ? FACE_REFERENCE_CREDITS : 0);
  return each * input.numImages;
}

// ───────────── Jobs, views, feedback ─────────────

/** Which FASHN endpoint a job runs. */
export const CATALOG_JOB_KINDS = ['PRODUCT_TO_MODEL', 'MODEL_CREATE', 'TRYON', 'EDIT', 'REFRAME', 'BACKGROUND_REMOVE'] as const;
export type CatalogJobKind = (typeof CATALOG_JOB_KINDS)[number];

export const FASHN_ENDPOINTS: Record<CatalogJobKind, string> = {
  PRODUCT_TO_MODEL: 'product-to-model',
  MODEL_CREATE: 'model-create',
  TRYON: 'tryon-max',
  EDIT: 'edit',
  REFRAME: 'reframe',
  BACKGROUND_REMOVE: 'background-remove',
};

/** What the picture is: the master, one of the poses, an edit, a model, … */
export const CATALOG_POSES = [
  'FRONT',
  'CLOSE_UP',
  'LEFT_ANGLE',
  'RIGHT_ANGLE',
  'FRONT_2',
  'THREE_QUARTER',
  'SIDE',
  'BACK',
  'EDITORIAL',
] as const;
export type CatalogPose = (typeof CATALOG_POSES)[number];
export const CATALOG_VIEWS = ['MODEL', 'MASTER', ...CATALOG_POSES, 'EDIT', 'REFRAME', 'CLEANUP'] as const;
export type CatalogView = (typeof CATALOG_VIEWS)[number];

export const CATALOG_JOB_STATUSES = ['QUEUED', 'RUNNING', 'DONE', 'FAILED'] as const;
export type CatalogJobStatus = (typeof CATALOG_JOB_STATUSES)[number];

export const CATALOG_REVIEWS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type CatalogReview = (typeof CATALOG_REVIEWS)[number];

export const CATALOG_REJECT_REASONS = [
  'GARMENT_CHANGED',
  'FABRIC_WRONG',
  'EMBROIDERY_CHANGED',
  'COLOUR_WRONG',
  'SILHOUETTE_WRONG',
  'SLEEVE_WRONG',
  'LENGTH_WRONG',
  'MODEL_WRONG',
  'FACE_WRONG',
  'POSE_WRONG',
  'BACKGROUND_WRONG',
  'SCALE_WRONG',
  'ACCESSORIES_WRONG',
  'POOR_QUALITY',
  'OTHER',
] as const;
export type CatalogRejectReason = (typeof CATALOG_REJECT_REASONS)[number];

export const CATALOG_SCORE_KEYS = [
  'garmentFidelity',
  'fabricFidelity',
  'embroideryFidelity',
  'modelRealism',
  'poseQuality',
  'backgroundQuality',
] as const;
export type CatalogScoreKey = (typeof CATALOG_SCORE_KEYS)[number];
export type CatalogScores = Partial<Record<CatalogScoreKey, number>> & { overall?: number };

/** Average of the given scores (one decimal), or null when none were given. */
export function overallScore(scores: Partial<Record<CatalogScoreKey, number>>): number | null {
  const values = CATALOG_SCORE_KEYS.map((k) => scores[k]).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** A rejected image may be tried again this many times (each with a stricter prompt). */
export const MAX_CATALOG_RETRIES = 2;

/** Flag on a back view made without a real back photo: the AI guessed the back. */
export const BACK_CONSTRUCTION_UNVERIFIED = 'BACK_CONSTRUCTION_UNVERIFIED';

// ───────────── Backgrounds and house style ─────────────

export const CATALOG_BACKGROUNDS = [
  // Arabian settings (the house look). Described for the AI; Pinterest images are never used.
  {
    id: 'arabian-arches-courtyard',
    name: 'Arabian Arches Courtyard',
    group: 'arabian',
    swatch: '#e6d3b3',
    prompt: 'sunlit Arabian courtyard with sand-stone arches, soft shadows and a few palms',
  },
  {
    id: 'desert-golden-hour',
    name: 'Desert Dunes · Golden Hour',
    group: 'arabian',
    swatch: '#d9a86c',
    prompt: 'Arabian desert dunes at golden hour, warm low sun, soft sand ripples, clear sky',
  },
  {
    id: 'heritage-old-town',
    name: 'Heritage Old Town',
    group: 'arabian',
    swatch: '#c8a77e',
    prompt: 'heritage Arabian old town street with mud-brick walls and carved wooden doors, soft daylight',
  },
  {
    id: 'luxury-majlis',
    name: 'Luxury Majlis Interior',
    group: 'arabian',
    swatch: '#cdb08a',
    prompt: 'luxury Arabian majlis interior with warm marble, brass lanterns and soft window daylight',
  },
  {
    id: 'modern-gulf',
    name: 'Modern Gulf Architecture',
    group: 'arabian',
    swatch: '#d8d2c6',
    prompt: 'modern Gulf city architecture with clean cream stone lines, palm trees and soft daylight',
  },
  {
    id: 'riad-courtyard',
    name: 'Riad Courtyard',
    group: 'arabian',
    swatch: '#b7c4b8',
    prompt: 'Moroccan riad courtyard with zellige tiles, a small fountain and carved arches',
  },
  {
    id: 'marble-palace',
    name: 'Marble Palace Hallway',
    group: 'arabian',
    swatch: '#ece4d6',
    prompt: 'grand cream marble palace hallway with tall arches and soft natural light',
  },
  // Plain studio backdrops for simple product shots.
  { id: 'warm-white-studio', name: 'Warm White Studio', group: 'studio', swatch: '#f6f1ea', prompt: 'warm white seamless studio backdrop' },
  { id: 'soft-beige-studio', name: 'Soft Beige Studio', group: 'studio', swatch: '#e8dccb', prompt: 'soft beige seamless studio backdrop' },
  { id: 'light-grey-studio', name: 'Light Grey Studio', group: 'studio', swatch: '#dcdcdc', prompt: 'light grey seamless studio backdrop' },
  {
    id: 'minimal-luxury-interior',
    name: 'Minimal Luxury Interior',
    group: 'studio',
    swatch: '#cbb9a1',
    prompt: 'minimal luxury interior with warm stone walls and soft daylight',
  },
  {
    id: 'neutral-architecture',
    name: 'Neutral Architecture',
    group: 'studio',
    swatch: '#b9b2a6',
    prompt: 'neutral modern architecture with clean arches and soft shadows',
  },
] as const;
export type CatalogBackgroundId = (typeof CATALOG_BACKGROUNDS)[number]['id'];
export const CATALOG_BACKGROUND_IDS = CATALOG_BACKGROUNDS.map((b) => b.id) as [CatalogBackgroundId, ...CatalogBackgroundId[]];
export const backgroundById = (id: string) => CATALOG_BACKGROUNDS.find((b) => b.id === id);

/** House style, kept short: FASHN works best with brief, concrete prompts. */
export const HOUSE_DNA =
  'premium modest fashion catalog photo, soft warm natural light, realistic skin and fabric, elegant understated styling, natural confident attitude';

/** The default setting for new models. */
export const DEFAULT_BACKGROUND_ID = 'arabian-arches-courtyard';

// ───────────── AI model description ─────────────

/** Head covering: always a shayla (Gulf style), never hair visible. */
export const SHAYLA_OPTIONS = [
  'chiffon shayla, softly wrapped Gulf style, in a colour that complements the abaya (a tone or accent from it, not the same colour as the abaya)',
  'black chiffon shayla, softly wrapped Gulf style',
  'soft beige chiffon shayla',
  'ivory chiffon shayla',
  'dusty rose chiffon shayla',
] as const;

// ───────────── Styling: framing, handbag, shoes ─────────────

export const CATALOG_FRAMINGS = ['WITH_SETTING', 'CLOSE', 'WIDE'] as const;
export type CatalogFraming = (typeof CATALOG_FRAMINGS)[number];
export const CATALOG_HANDBAGS = ['MINI_TOP_HANDLE', 'CLUTCH', 'SHOULDER', 'NONE', 'CUSTOM'] as const;
export type CatalogHandbag = (typeof CATALOG_HANDBAGS)[number];
export const CATALOG_SHOES = ['POINTED_FLATS', 'BALLET_FLATS', 'FLAT_MULES', 'EMBELLISHED_SANDALS', 'CUSTOM'] as const;
export type CatalogShoes = (typeof CATALOG_SHOES)[number];
/** Small finishing touches (none by default). */
export const CATALOG_ACCESSORIES = ['EARRINGS', 'SHAYLA_PIN', 'BRACELET', 'WATCH', 'RING', 'SUNGLASSES'] as const;
export type CatalogAccessory = (typeof CATALOG_ACCESSORIES)[number];

const customText = z.string().trim().max(160).optional();

const stylingShape = z.object({
    framing: z.enum(CATALOG_FRAMINGS).default('WITH_SETTING'),
    handbag: z.enum(CATALOG_HANDBAGS).default('MINI_TOP_HANDLE'),
    /** With handbag CUSTOM: the designer's own bag ("small pearl-beaded mini bag in ivory"). */
    handbagCustom: customText,
    shoes: z.enum(CATALOG_SHOES).default('POINTED_FLATS'),
    /** With shoes CUSTOM: the designer's own shoes ("gold embellished khussa flats"). */
    shoesCustom: customText,
    accessories: z.array(z.enum(CATALOG_ACCESSORIES)).max(CATALOG_ACCESSORIES.length).default([]),
    /** Anything else ("thin gold chain belt"). */
    accessoriesCustom: z.string().trim().max(200).optional(),
});
/** Styling as sent by the form; a custom bag or shoes must be described. */
export const catalogStyling = stylingShape.superRefine((v, ctx) => {
    if (v.handbag === 'CUSTOM' && !v.handbagCustom) ctx.addIssue({ code: 'custom', path: ['handbagCustom'], message: 'Describe the bag' });
    if (v.shoes === 'CUSTOM' && !v.shoesCustom) ctx.addIssue({ code: 'custom', path: ['shoesCustom'], message: 'Describe the shoes' });
});
/** For building prompts: defaults filled in, never throws (the live preview runs while typing). */
const stylingOf = (styling: Partial<CatalogStyling> = {}) => stylingShape.parse(styling);
export type CatalogStyling = z.infer<typeof catalogStyling>;

const FRAMING_TEXT: Record<CatalogFraming, string> = {
  WITH_SETTING:
    'Photographed from about 5–6 m away at eye level: she fills about two thirds of the image height, standing on the ground in the middle distance at a realistic size for the scene, with matching perspective and horizon, natural contact shadows under her feet, light that matches the scene and a softly blurred background.',
  CLOSE: 'Close full-body catalog framing: she fills most of the image height, head to toe, with a little space above and below.',
  WIDE: 'Wide environmental shot from about 8–10 m away: she is smaller in a grand scene, at a realistic size against the architecture, standing on the ground with matching perspective and natural shadows.',
};
const HANDBAG_TEXT: Record<Exclude<CatalogHandbag, 'NONE' | 'CUSTOM'>, string> = {
  MINI_TOP_HANDLE: 'a small structured mini top-handle bag',
  CLUTCH: 'a small elegant clutch',
  SHOULDER: 'a small shoulder bag on a short strap',
};
const SHOES_TEXT: Record<Exclude<CatalogShoes, 'CUSTOM'>, string> = {
  POINTED_FLATS: 'pointed-toe leather flats',
  BALLET_FLATS: 'soft leather ballet flats',
  FLAT_MULES: 'elegant flat mules',
  EMBELLISHED_SANDALS: 'flat sandals with delicate embellishment, Gulf style',
};

const ACCESSORY_TEXT: Record<CatalogAccessory, string> = {
  EARRINGS: 'delicate earrings just visible at the edge of the shayla',
  SHAYLA_PIN: 'a small elegant pin on the shayla',
  BRACELET: 'a slim bracelet',
  WATCH: 'an elegant slim watch',
  RING: 'a delicate ring',
  SUNGLASSES: 'sunglasses held in one hand',
};
const JEWELLERY: readonly CatalogAccessory[] = ['EARRINGS', 'SHAYLA_PIN', 'BRACELET', 'WATCH', 'RING'];

/** Collapse spaces and stray punctuation in typed text ("short ." → "short"). */
export function tidy(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
    .replace(/[\s.,;:]+$/, '');
}

/** Jewellery was chosen (then the prompt must not say "no jewellery"). */
export function hasJewellery(styling: Partial<CatalogStyling> = {}): boolean {
  const s = stylingOf(styling);
  return s.accessories.some((a) => JEWELLERY.includes(a)) || Boolean(tidy(s.accessoriesCustom));
}

/** Camera distance and scale, so she sits in the scene at a realistic size. */
export function framingText(styling: Partial<CatalogStyling> = {}): string {
  return ` ${FRAMING_TEXT[stylingOf(styling).framing]}`;
}

/** Handbag, shoes and accessories: coordinated with the abaya, never covering or changing it. */
export function accessoriesText(styling: Partial<CatalogStyling> = {}): string {
  const s = stylingOf(styling);
  const bagName = s.handbag === 'CUSTOM' ? tidy(s.handbagCustom) : s.handbag === 'NONE' ? '' : HANDBAG_TEXT[s.handbag];
  const bag = bagName
    ? ` She carries ${s.handbag === 'CUSTOM' ? `a ${bagName.replace(/^(a|an) /i, '')}` : `${bagName} in a colour that complements the abaya and the setting`}, kept small and held at her side below the waist; it never covers the embroidery or the front opening. No logos.`
    : ' No handbag.';
  const shoeName =
    s.shoes === 'CUSTOM' && tidy(s.shoesCustom) ? tidy(s.shoesCustom) : `${SHOES_TEXT[s.shoes === 'CUSTOM' ? 'POINTED_FLATS' : s.shoes]} in a coordinating colour`;
  const extras = [...s.accessories.map((a) => ACCESSORY_TEXT[a]), tidy(s.accessoriesCustom)].filter(Boolean);
  const accessories = extras.length
    ? ` Accessories: ${extras.join(', ')}; small and elegant, coordinated with the abaya, never covering or changing it, no logos.`
    : '';
  return `${bag} She wears ${shoeName}; only the toes show under the hem.${accessories}`;
}

export const aiModelAttributes = z.object({
  age: z.number().int().min(18).max(65).default(27),
  appearance: z.string().trim().max(80).default('Middle Eastern, Arabian Gulf'),
  /** Natural warm olive range: not pale, not dark. */
  skinTone: z.string().trim().max(80).default('warm olive, light wheatish'),
  /** Face, eyes, brows… (the "New face" button fills this so every model looks different). */
  features: z.string().trim().max(200).default(''),
  makeup: z.string().trim().max(80).default('soft natural makeup'),
  hijab: z.string().trim().max(200).default(SHAYLA_OPTIONS[0]),
  /** Only used if no head covering is given. */
  hair: z.string().trim().max(60).default(''),
  bodyType: z.string().trim().max(60).default('slim-average natural proportions'),
  /** Her real height in cm (e.g. a real person's): the image keeps true proportions for it. */
  heightCm: z.number().int().min(130).max(200).optional(),
  expression: z.string().trim().max(60).default('calm, confident'),
  extra: z.string().trim().max(200).default(''),
});
export type AiModelAttributes = z.infer<typeof aiModelAttributes>;

const FACES = ['soft oval face', 'heart-shaped face', 'high cheekbones', 'softly rounded face', 'defined jawline', 'long elegant face'];
const EYES = ['large dark brown almond eyes', 'deep-set hazel eyes', 'warm brown eyes with long lashes', 'dark expressive eyes', 'honey-brown eyes'];
const BROWS = ['full natural brows', 'softly arched brows', 'straight thick brows', 'defined dark brows'];
const NOSES = ['straight nose', 'slightly aquiline nose', 'soft rounded nose', 'refined narrow nose'];
const LIPS = ['full lips', 'softly defined lips', 'natural medium lips'];
const SHADES = ['warm olive', 'light warm olive', 'golden wheatish', 'light wheatish with a warm undertone', 'sand-beige olive'];
const MAKEUP = ['soft natural makeup', 'subtle kohl eyeliner and natural lips', 'soft glam with nude lips', 'fresh minimal makeup', 'warm bronzed makeup with soft rose lips'];
const EXPRESSIONS = ['calm, confident', 'soft, serene', 'gentle half-smile', 'poised, elegant', 'warm, approachable'];
const BODIES = ['slim-average natural proportions', 'tall, slender proportions', 'average natural proportions'];

/**
 * A different face every time, always within the house look (Middle Eastern, warm olive skin,
 * not too fair and not too dark). The same seed gives the same traits.
 */
export function varietyTraits(seed: number): Pick<AiModelAttributes, 'age' | 'skinTone' | 'features' | 'makeup' | 'expression' | 'bodyType'> {
  let x = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  const next = () => (x = (x * 48271) % 2147483647);
  const pick = <T,>(list: readonly T[]): T => list[next() % list.length]!;
  return {
    age: 22 + (next() % 14),
    skinTone: pick(SHADES),
    features: [pick(FACES), pick(EYES), pick(BROWS), pick(NOSES), pick(LIPS)].join(', '),
    makeup: pick(MAKEUP),
    expression: pick(EXPRESSIONS),
    bodyType: pick(BODIES),
  };
}

/**
 * Height in words for the prompt. Image models default to tall runway proportions, so the
 * real height is spelled out with an instruction not to stretch her.
 */
export function heightText(cm?: number): string {
  if (!cm) return '';
  const label = cm < 158 ? 'petite' : cm <= 165 ? 'average height' : cm <= 172 ? 'tall' : 'very tall';
  return (
    ` She is about ${cm} cm tall (${label}): show her true height and natural proportions for it,` +
    ' do not make her taller, longer-legged or slimmer like a runway model, and let the abaya fall naturally for her height.'
  );
}

/** Every typed attribute tidied for the prompt. */
function tidyAttributes(a: AiModelAttributes): AiModelAttributes {
  return {
    ...a,
    appearance: tidy(a.appearance),
    skinTone: tidy(a.skinTone),
    features: tidy(a.features),
    makeup: tidy(a.makeup),
    hijab: tidy(a.hijab),
    hair: tidy(a.hair),
    bodyType: tidy(a.bodyType),
    expression: tidy(a.expression),
    extra: tidy(a.extra),
  };
}

/** The designer's own words, added on top of the house rules (never replacing garment protection). */
function direction(text?: string): string {
  return text?.trim() ? ` Designer direction: ${text.trim().replace(/\.$/, '')}.` : '';
}

/** model-create prompt: a full-body model in a plain fitted base outfit, on the chosen background. */
export function buildModelPrompt(attributes: AiModelAttributes, backgroundId: string, designerDirection?: string): string {
  const a = tidyAttributes(attributes);
  const background = backgroundById(backgroundId)?.prompt ?? backgroundById(DEFAULT_BACKGROUND_ID)!.prompt;
  const head = a.hijab ? `wearing a ${a.hijab}, covering all her hair` : a.hair;
  const look = [a.features, a.makeup].filter(Boolean).join(', ');
  return [
    `Full-length photo of a realistic female fashion model, about ${a.age} years old, ${a.appearance} appearance, ${a.skinTone} skin with natural texture (not too fair, not too dark)${look ? `, ${look}` : ''}, ${head}, ${a.bodyType}, ${a.expression} expression.${heightText(a.heightCm)}`,
    'Standing straight facing the camera, arms relaxed, wearing a plain fitted black long-sleeve base dress and pointed-toe leather flats.',
    `${capitalise(background)}, ${HOUSE_DNA}. Natural hands. Full body head to toe. ${FRAMING_TEXT.CLOSE} No jewellery, no text, no logo.`,
    a.extra ? a.extra : '',
  ]
    .filter(Boolean)
    .join(' ') + direction(designerDirection);
}

// ───────────── Garment-fidelity prompts ─────────────

/** What must never change unless the designer asks for it. */
const KEEP = ['silhouette', 'length', 'sleeves and cuffs', 'neckline', 'closure', 'seams and panels', 'embroidery and embellishments', 'fabric', 'colour'];

// ───────────── Sketch and design references ─────────────

/** Extra images that describe the design: fabric, print, embroidery… (uploaded, never Pinterest). */
export const DESIGN_REFERENCE_TYPES = ['FABRIC_COLOUR', 'FABRIC_PATTERN', 'EMBROIDERY', 'LACE_TRIM', 'CLOSURE', 'OTHER'] as const;
export type DesignReferenceType = (typeof DESIGN_REFERENCE_TYPES)[number];
export const MAX_DESIGN_REFERENCES = 6;

export interface DesignReferenceNote {
  type: DesignReferenceType;
  note?: string | null;
}

const REFERENCE_NAMES: Record<DesignReferenceType, string> = {
  FABRIC_COLOUR: 'Fabric and colour',
  FABRIC_PATTERN: 'Fabric print or pattern',
  EMBROIDERY: 'Embroidery',
  LACE_TRIM: 'Lace or trim',
  CLOSURE: 'Buttons or closure',
  OTHER: 'Detail',
};

/** The references' notes as one prompt sentence ("Design details: Fabric and colour: matte black nida; …"). */
function referenceDetails(refs?: readonly DesignReferenceNote[]): string {
  const notes = (refs ?? []).filter((r) => r.note?.trim()).map((r) => `${REFERENCE_NAMES[r.type]}: ${r.note!.trim().replace(/\.$/, '')}`);
  return notes.length ? ` Design details: ${notes.join('; ')}.` : '';
}

/** When the product image is the designer's sketch rather than a photo. */
const SKETCH_LINE =
  " The product image is the designer's sketch: make it a real, finished abaya with exactly this shape, sleeves, neckline, length and details, in real fabric with real stitching. It must look like a photograph, not a drawing.";

/** The order references are applied in: base fabric first, then print, then details. */
export function orderReferences<T extends { type: DesignReferenceType }>(refs: readonly T[]): T[] {
  return [...refs].sort((a, b) => DESIGN_REFERENCE_TYPES.indexOf(a.type) - DESIGN_REFERENCE_TYPES.indexOf(b.type));
}

/** The design edit that applies one reference photo (sent as FASHN image_context). */
export function referenceEdit(ref: DesignReferenceNote): { editType: CatalogEditType; instruction: string } {
  const note = ref.note?.trim() ? ` (${ref.note.trim().replace(/\.$/, '')})` : '';
  switch (ref.type) {
    case 'FABRIC_COLOUR':
      return { editType: 'FABRIC', instruction: `Change the abaya fabric and colour to match the fabric in the reference image${note}` };
    case 'FABRIC_PATTERN':
      return { editType: 'FABRIC', instruction: `Apply the print or pattern from the reference image to the abaya fabric, at a realistic scale${note}` };
    case 'EMBROIDERY':
      return { editType: 'EMBROIDERY', instruction: `Make the embroidery match the embroidery in the reference image, in the same places as now${note}` };
    case 'LACE_TRIM':
      return { editType: 'EMBELLISHMENT', instruction: `Add the lace or trim from the reference image along the edges where it belongs${note}` };
    case 'CLOSURE':
      return { editType: 'CLOSURE', instruction: `Make the buttons or closure match the reference image${note}` };
    case 'OTHER':
      return { editType: 'OTHER', instruction: `Apply the detail shown in the reference image to the abaya${note}` };
  }
}

/** tryon-max: the abaya photo onto the model photo (face, pose and background come from the model photo). */
export function buildMasterPrompt(
  garmentDescription?: string,
  designerDirection?: string,
  design: { sketch?: boolean; references?: readonly DesignReferenceNote[]; styling?: Partial<CatalogStyling> } = {},
): string {
  const facts =
    (garmentDescription?.trim() ? ` The abaya: ${garmentDescription.trim()}.` : '') +
    (design.sketch ? SKETCH_LINE : '') +
    referenceDetails(design.references);
  const extra = direction(designerDirection);
  return (
    `Full-length abaya worn exactly as in the product photo: keep its ${KEEP.join(', ')} unchanged; do not add, remove or simplify any detail.${facts}` +
    ' Full body head to toe, sleeves and hem fully visible, natural fabric weight and folds.' +
    (design.styling ? accessoriesText(design.styling) : '') +
    (extra ? `${extra} The abaya itself must still match the product photo exactly.` : '')
  );
}

/** The first (master) photo already shows what makes the style special (opening, wings, sleeves). */
const heroPose = (style?: AbayaStyle): CatalogPose =>
  style === 'OPEN_FRONT' || style === 'BUTTERFLY' || style === 'KAFTAN' || style === 'KIMONO' ? 'FRONT_2' : 'FRONT';

/**
 * product-to-model (one step): a new model wearing the abaya, in the chosen setting, in one
 * call. The look gives every abaya a new Middle Eastern face in a shayla; with a face photo
 * (personal model) the face comes from that photo instead.
 */
export function buildOneStepPrompt(input: {
  attributes: AiModelAttributes;
  backgroundId?: string;
  /** The designer's own background photo is used instead of a described setting. */
  hasBackgroundPhoto?: boolean;
  hasFacePhoto?: boolean;
  garmentDescription?: string;
  style?: AbayaStyle;
  embroidery?: readonly EmbroideryPlacement[];
  direction?: string;
  sketch?: boolean;
  references?: readonly DesignReferenceNote[];
  styling?: Partial<CatalogStyling>;
}): string {
  const a = tidyAttributes(input.attributes);
  const person = input.hasFacePhoto
    ? `the woman from the face reference, ${a.skinTone} skin with natural texture, ${a.bodyType}`
    : `a ${a.age}-year-old woman of ${a.appearance} appearance, ${a.skinTone} skin with natural texture (not too fair, not too dark)${[a.features, a.makeup].filter(Boolean).length ? `, ${[a.features, a.makeup].filter(Boolean).join(', ')}` : ''}, ${a.bodyType}, ${a.expression} expression`;
  const head = a.hijab ? ` She wears a ${a.hijab}, covering all her hair.` : '';
  const facts =
    (input.garmentDescription?.trim() ? ` The abaya: ${input.garmentDescription.trim()}.` : '') +
    (input.sketch ? SKETCH_LINE : '') +
    referenceDetails(input.references);
  const setting = input.hasBackgroundPhoto
    ? 'Setting: the background from the background reference.'
    : `Setting: ${backgroundById(input.backgroundId ?? DEFAULT_BACKGROUND_ID)?.prompt ?? backgroundById(DEFAULT_BACKGROUND_ID)!.prompt}.`;
  return (
    `Realistic premium fashion catalog photo of ${person}.${heightText(a.heightCm)}${head}` +
    ` She wears the abaya from the product image exactly: keep its ${KEEP.join(', ')} unchanged; do not add, remove or simplify any detail.${facts}` +
    ` Pose: ${poseText(heroPose(input.style), { style: input.style, embroidery: input.embroidery })}, full body head to toe, sleeves and hem fully visible.` +
    accessoriesText(input.styling) +
    ` ${setting}${framingText(input.styling)} ${capitalise(HOUSE_DNA)}. ${hasJewellery(input.styling) ? 'No text, no logo.' : 'No jewellery, no text, no logo.'}` +
    (input.direction?.trim() ? `${direction(input.direction)} The abaya itself must still match the product image exactly.` : '')
  );
}

/** Where the abaya's embroidery or embellishment is (chooses and shapes the poses). */
export const EMBROIDERY_PLACEMENTS = ['CHEST', 'BACK', 'SLEEVES', 'HEM', 'ALL_OVER'] as const;
export type EmbroideryPlacement = (typeof EMBROIDERY_PLACEMENTS)[number];

export interface PoseContext {
  style?: AbayaStyle;
  embroidery?: readonly EmbroideryPlacement[];
}

/** Each pose, phrased to show off what makes this abaya special. */
export function poseText(pose: CatalogPose, ctx: PoseContext = {}): string {
  const has = (p: EmbroideryPlacement) => ctx.embroidery?.includes(p) ?? false;
  switch (pose) {
    case 'CLOSE_UP':
      return 'a waist-up fashion portrait, framed from the waist up like a real model photograph, with her face, shayla, neckline, chest embroidery and sleeves in sharp detail';
    case 'LEFT_ANGLE':
      return 'a full-body pose turned about 45 degrees to her left, showing the left side of the abaya, the sleeve and how the fabric falls';
    case 'RIGHT_ANGLE':
      return 'a full-body pose turned about 45 degrees to her right, showing the right side of the abaya, the sleeve and how the fabric falls';
    case 'FRONT':
      return has('CHEST')
        ? 'a clean, elegant front-facing pose with hands relaxed away from the chest so the embroidery is fully visible'
        : 'a clean, elegant front-facing pose';
    case 'FRONT_2':
      switch (ctx.style) {
        case 'OPEN_FRONT':
          return 'a slow walking step towards the camera so the open front gently parts, one hand lightly holding the front edge';
        case 'BUTTERFLY':
        case 'KAFTAN':
          return 'arms gently raised out to the sides, about 45 degrees, so the full butterfly wings of fabric open and drape';
        case 'KIMONO':
          return 'arms held slightly away from the body so the wide sleeves fall and drape fully';
        case 'BISHT':
          return 'standing tall with one hand lightly holding the edge of the bisht';
        default:
          return 'a subtle second front pose with a slight hip shift and relaxed, graceful posture';
      }
    case 'THREE_QUARTER':
      return 'a natural three-quarter pose, turned about 45 degrees, showing the side silhouette, sleeve shape, drape and how the hem falls';
    case 'SIDE':
      return has('SLEEVES')
        ? 'a clean side view with the near arm slightly forward so the sleeve embroidery is clearly visible'
        : 'a clean side view showing the side silhouette, fabric fall, sleeve shape and hem';
    case 'BACK':
      return has('BACK')
        ? 'a clean full-body back view, standing straight so the back embroidery is fully visible and undistorted'
        : 'a clean full-body back view';
    case 'EDITORIAL':
      if (ctx.style === 'OPEN_FRONT') return 'walking in motion with the open abaya flowing gracefully behind her';
      if (ctx.style === 'BUTTERFLY' || ctx.style === 'KAFTAN') return 'turning gracefully mid-step so the fabric wings flow around her';
      if (has('HEM')) return 'a slow walking step so the hem embroidery moves into view';
      return 'looking softly over her shoulder with a confident, elegant attitude';
  }
}

/** The poses that best show this abaya (the designer can still change the choice). */
export function suggestPoses(ctx: PoseContext = {}): CatalogPose[] {
  const has = (p: EmbroideryPlacement) => ctx.embroidery?.includes(p) ?? false;
  const picks: CatalogPose[] = [];
  if (has('BACK')) picks.push('BACK');
  switch (ctx.style) {
    case 'OPEN_FRONT':
    case 'BUTTERFLY':
    case 'KAFTAN':
      picks.push('FRONT_2', 'THREE_QUARTER', 'EDITORIAL');
      break;
    case 'KIMONO':
      picks.push('FRONT_2', 'SIDE', 'THREE_QUARTER');
      break;
    case 'BISHT':
      picks.push('FRONT_2', 'THREE_QUARTER', 'SIDE');
      break;
    default:
      picks.push('FRONT_2', 'THREE_QUARTER', 'BACK');
  }
  if (has('SLEEVES')) picks.push('SIDE');
  if (has('HEM')) picks.push('EDITORIAL');
  return CATALOG_POSES.filter((p) => picks.includes(p));
}

/** edit on the approved master: change only the pose. */
export function buildPosePrompt(pose: CatalogPose, hasBackReference: boolean, ctx: PoseContext & { direction?: string } = {}): string {
  const back =
    pose === 'BACK'
      ? hasBackReference
        ? ' The back of the abaya must match the reference image exactly: seams, panels, embroidery and hem. Do not invent back details.'
        : ' Keep the back plain and simple; do not invent embroidery, seams or panels.'
      : '';
  const closeUp = pose === 'CLOSE_UP';
  return (
    `Same woman, same abaya, same background and lighting as this image. Change ONLY the ${closeUp ? 'pose and framing' : 'pose'} to ${poseText(pose, ctx)}.${back}` +
    ` Do not change any detail of the garment (${KEEP.join(', ')}), her face, shayla, handbag, shoes, accessories or proportions${closeUp ? '' : ', or her size in the scene'}.` +
    (closeUp ? ' Waist-up framing; the fabric and embroidery stay exactly as they are.' : ' Full body head to toe.') +
    direction(ctx.direction)
  );
}

/**
 * "Images" on a master is a photoshoot of ONE model: the full-body master first, then these
 * shots made from it (same woman, abaya and background).
 *   1 → full body · 2 → + close-up · 3 → + left and right angles · 4 → + close-up, left and right
 */
export function photoshootShots(images: number): CatalogPose[] {
  switch (images) {
    case 2:
      return ['CLOSE_UP'];
    case 3:
      return ['LEFT_ANGLE', 'RIGHT_ANGLE'];
    case 4:
      return ['CLOSE_UP', 'LEFT_ANGLE', 'RIGHT_ANGLE'];
    default:
      return [];
  }
}

// ───────────── Design edits ─────────────

export const CATALOG_EDIT_TYPES = [
  'FABRIC',
  'COLOUR',
  'EMBROIDERY',
  'EMBELLISHMENT',
  'SLEEVES',
  'CUFFS',
  'NECKLINE',
  'LENGTH',
  'SILHOUETTE',
  'CLOSURE',
  'ACCESSORIES',
  'BACKGROUND',
  'POSE',
  'LIGHTING',
  'MODEL',
  'OTHER',
] as const;
export type CatalogEditType = (typeof CATALOG_EDIT_TYPES)[number];

/** Checked in order: the first match wins (sequins before embroidery, cuffs before sleeves). */
const EDIT_KEYWORDS: [CatalogEditType, RegExp][] = [
  ['EMBELLISHMENT', /\b(sequin|sequins|bead|beads|beaded|pearl|pearls|stone|stones|crystal|crystals|rhinestone|mirror work|lace)\b/i],
  ['EMBROIDERY', /\b(embroider\w*|zari|threadwork|thread work|motif|applique)\b/i],
  ['BACKGROUND', /\b(background|backdrop|scene|studio|interior|setting)\b/i],
  ['POSE', /\b(pose|three[- ]quarter|side view|back view|profile view|walking|sitting)\b/i],
  ['LIGHTING', /\b(light|lighting|shadow|shadows|brighter|darker|exposure)\b/i],
  ['CUFFS', /\bcuffs?\b/i],
  ['SLEEVES', /\bsleeves?\b/i],
  ['NECKLINE', /\b(neck|neckline|collar|v-neck|round neck)\b/i],
  ['CLOSURE', /\b(button|buttons|zip|zipper|snap|snaps|closure|placket|open front|front opening|belt|tie)\b/i],
  ['LENGTH', /\b(length|longer|shorter|ankle|floor[- ]length|midi|hem)\b/i],
  ['SILHOUETTE', /\b(silhouette|a-line|flared|wider|narrower|fitted|loose|oversized|shape)\b/i],
  ['FABRIC', /\b(fabric|nida|crepe|chiffon|satin|silk|velvet|linen|jersey|georgette|cotton|material|texture|matte|glossy)\b/i],
  ['COLOUR', /\b(colou?r|black|white|navy|beige|maroon|emerald|green|blue|red|pink|rose|grey|gray|brown|olive|gold|silver|ivory|cream)\b/i],
  ['ACCESSORIES', /\b(bag|handbag|clutch|shoes|heels|jewel\w*|necklace|earrings|watch|scarf|hijab|niqab|accessor\w*)\b/i],
  ['MODEL', /\b(model|face|skin|hair|woman|girl|age)\b/i],
];

/** Which kind of change the designer asked for (simple and predictable; no AI needed). */
export function classifyEdit(instruction: string): CatalogEditType {
  return EDIT_KEYWORDS.find(([, re]) => re.test(instruction))?.[0] ?? 'OTHER';
}

/** The garment parts an edit type is allowed to change; everything else is kept. */
const CHANGES: Partial<Record<CatalogEditType, string[]>> = {
  FABRIC: ['fabric'],
  COLOUR: ['colour'],
  EMBROIDERY: ['embroidery and embellishments'],
  EMBELLISHMENT: ['embroidery and embellishments'],
  SLEEVES: ['sleeves and cuffs'],
  CUFFS: ['sleeves and cuffs'],
  NECKLINE: ['neckline'],
  LENGTH: ['length'],
  SILHOUETTE: ['silhouette'],
  CLOSURE: ['closure'],
};

/** edit prompt: change ONLY what was asked, list everything that must stay. */
export function buildEditPrompt(type: CatalogEditType, instruction: string): string {
  const ask = instruction.trim().replace(/\.$/, '');
  const changing = CHANGES[type] ?? [];
  const keepGarment = KEEP.filter((k) => !changing.includes(k));
  const scene =
    type === 'BACKGROUND'
      ? 'Keep the same woman, pose and the abaya exactly as they are.'
      : type === 'POSE'
        ? 'Keep the same woman, background and lighting.'
        : type === 'MODEL'
          ? 'Keep the pose, background and lighting.'
          : type === 'LIGHTING'
            ? 'Keep the same woman, pose and background.'
            : 'Keep the same woman, pose, background and lighting.';
  const extra =
    type === 'EMBROIDERY' || type === 'EMBELLISHMENT'
      ? ' Change only the requested area; keep all other embroidery exactly where it is. It must look real: raised thread, natural shine, following the fabric folds.'
      : type === 'FABRIC'
        ? ' The new fabric must drape realistically, with no invented patterns or texture.'
        : '';
  return `Edit this image. ${ask}. Change ONLY that. Keep the abaya's ${keepGarment.join(', ')} exactly as they are. ${scene}${extra}`;
}

/** Added to the prompt when a rejected image is tried again. */
const RETRY_FIX: Partial<Record<CatalogRejectReason, string>> = {
  GARMENT_CHANGED: 'Reproduce the abaya exactly as in the product image; do not redesign anything.',
  FABRIC_WRONG: 'Match the fabric look of the product image exactly: same sheen, weight and drape.',
  EMBROIDERY_CHANGED: 'Preserve the existing embroidery exactly: do not alter, remove, simplify or move any of it.',
  COLOUR_WRONG: 'Match the colour of the product image exactly.',
  SILHOUETTE_WRONG: 'Keep the exact silhouette and width of the abaya.',
  SLEEVE_WRONG: 'Keep the exact sleeve and cuff shape.',
  LENGTH_WRONG: 'Keep the full length: the hem reaches the ankles.',
  MODEL_WRONG: 'Keep the model exactly as in the model image.',
  FACE_WRONG: "Keep the woman's face exactly as it is.",
  POSE_WRONG: 'Use a simple, natural full-body pose with the whole garment visible.',
  BACKGROUND_WRONG: 'Keep the background exactly as in the source image.',
  SCALE_WRONG:
    'Show her at a realistic size for the scene: photographed from about 6 m away, smaller in the frame, standing on the ground with matching perspective, horizon and contact shadows.',
  ACCESSORIES_WRONG:
    'Keep the handbag small and at her side, never covering the abaya; flat shoes with only the toes showing under the hem; accessories small and subtle.',
  POOR_QUALITY: 'Sharp focus, clean realistic detail.',
};

export function retryPrompt(prompt: string, reasons: readonly CatalogRejectReason[]): string {
  const fixes = [...new Set(reasons.map((r) => RETRY_FIX[r]).filter(Boolean))];
  return fixes.length ? `${prompt} ${fixes.join(' ')}` : prompt;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ───────────── Request bodies ─────────────

const storagePath = z.string().min(1).max(300);
/** The designer's own direction ("soft evening light, walking towards camera"). */
const directionText = z.string().trim().max(400).optional();
const designReference = z.object({
  type: z.enum(DESIGN_REFERENCE_TYPES),
  path: z.string().min(1).max(300),
  note: z.string().trim().max(200).optional(),
});
/** Sketch instead of a photo, and design reference photos with notes. */
const designInputs = {
  /** Framing, handbag and shoes (house defaults: full body with setting, mini bag, pointed flats). */
  styling: catalogStyling.default({}),
  /** The abaya image is the designer's sketch (not a photo). */
  sketch: z.boolean().default(false),
  references: z.array(designReference).max(MAX_DESIGN_REFERENCES).default([]),
  /** After the master, apply each reference photo with a design edit, one after another. */
  applyReferences: z.boolean().default(false),
};
const prompt = z.string().trim().min(5).max(1500);
const settings = {
  resolution: z.enum(CATALOG_RESOLUTIONS).default('2k'),
  mode: z.enum(CATALOG_MODES).default('balanced'),
  numImages: z.number().int().min(1).max(4).default(1),
  seed: z.number().int().min(0).max(4_294_967_295).optional(),
};

/** POST /v1/studio/catalog/models/ai — create an AI model (model-create) to pick from. */
export const createAiModelBody = z.object({
  attributes: aiModelAttributes,
  backgroundId: z.enum(CATALOG_BACKGROUND_IDS).default(DEFAULT_BACKGROUND_ID),
  direction: directionText,
  /** The designer may edit the built prompt. */
  prompt: prompt.optional(),
  ...settings,
});
export type CreateAiModelBody = z.input<typeof createAiModelBody>;

/** POST /v1/studio/catalog/models/personal — a real person's full-body photo, with consent. */
export const createPersonalModelBody = z.object({
  name: z.string().trim().min(2).max(60),
  imagePath: storagePath,
  /** The person agreed to their photo being used to make catalog images. */
  consent: z.literal(true),
});

/** POST /v1/studio/catalog/models/from-image — save a generated model as a profile. */
export const saveModelProfileBody = z.object({ imageId: z.string().uuid(), name: z.string().trim().min(2).max(60).optional() });

/** POST /v1/studio/catalog/masters — the abaya on a saved model (tryon-max). */
export const createMasterBody = z.object({
  /** An uploaded abaya photo, or (abayaImageId) a photo cleaned with background-remove. */
  abayaPath: storagePath.optional(),
  abayaImageId: z.string().uuid().optional(),
  backPath: storagePath.optional(),
  modelProfileId: z.string().uuid(),
  garmentDescription: z.string().trim().max(600).optional(),
  /** Abaya style and embroidery placement: they choose and shape the poses. */
  style: z.enum(ABAYA_STYLES).optional(),
  embroidery: z.array(z.enum(EMBROIDERY_PLACEMENTS)).max(5).default([]),
  direction: directionText,
  ...designInputs,
  prompt: prompt.optional(),
  ...settings,
}).refine((b) => Boolean(b.abayaPath) !== Boolean(b.abayaImageId), { message: 'Give the abaya photo', path: ['abayaPath'] });
export type CreateMasterBody = z.input<typeof createMasterBody>;

/** POST /v1/studio/catalog/masters/one-step — product-to-model: new model + abaya + setting in one call. */
export const createOneStepBody = z
  .object({
    abayaPath: storagePath.optional(),
    abayaImageId: z.string().uuid().optional(),
    backPath: storagePath.optional(),
    attributes: aiModelAttributes,
    backgroundId: z.enum(CATALOG_BACKGROUND_IDS).default(DEFAULT_BACKGROUND_ID),
    /** Your own background photo (uploaded, never Pinterest): used instead of the described setting. */
    backgroundPath: storagePath.optional(),
    /** A real person's face (personal model): FASHN face reference, +3 credits per image. */
    facePath: storagePath.optional(),
    faceConsent: z.boolean().optional(),
    garmentDescription: z.string().trim().max(600).optional(),
    style: z.enum(ABAYA_STYLES).optional(),
    embroidery: z.array(z.enum(EMBROIDERY_PLACEMENTS)).max(5).default([]),
    direction: directionText,
    ...designInputs,
    prompt: prompt.optional(),
    ...settings,
  })
  .refine((b) => Boolean(b.abayaPath) !== Boolean(b.abayaImageId), { message: 'Give the abaya photo', path: ['abayaPath'] })
  .refine((b) => !b.facePath || b.faceConsent === true, { message: 'The person must agree to their photo being used', path: ['faceConsent'] });
export type CreateOneStepBody = z.input<typeof createOneStepBody>;

/** POST /v1/studio/catalog/images/:id/poses — poses from an approved master (edit). */
export const createPosesBody = z.object({
  poses: z.array(z.enum(CATALOG_POSES)).min(1).max(6),
  backPath: storagePath.optional(),
  direction: directionText,
  resolution: z.enum(CATALOG_RESOLUTIONS).default('2k'),
  mode: z.enum(CATALOG_MODES).default('balanced'),
});

/** POST /v1/studio/catalog/images/:id/edits — a controlled design edit (edit, optional mask). */
export const createEditBody = z.object({
  instruction: z.string().trim().min(3).max(400),
  editType: z.enum(CATALOG_EDIT_TYPES).optional(),
  prompt: prompt.optional(),
  maskPath: storagePath.optional(),
  /** A reference photo for the edit, e.g. your own background photo (uploaded, never Pinterest). */
  contextPath: storagePath.optional(),
  ...settings,
});

/** POST /v1/studio/catalog/images/:id/reframe */
export const createReframeBody = z.object({
  aspectRatio: z.enum(CATALOG_ASPECT_RATIOS),
  resolution: z.enum(CATALOG_RESOLUTIONS).default('2k'),
  mode: z.enum(CATALOG_MODES).default('balanced'),
});

/** POST /v1/studio/catalog/cleanups — remove the background of an abaya photo. */
export const createCleanupBody = z.object({ imagePath: storagePath });

const score = z.number().int().min(1).max(10).optional();

/** POST /v1/studio/catalog/references/describe — a short description of a reference photo (Gemini, free). */
export const describeReferenceBody = z.object({
  type: z.enum(DESIGN_REFERENCE_TYPES),
  path: z.string().min(1).max(300),
});
export interface DescribeReferenceResponse {
  /** e.g. "dusty mauve satin with a soft sheen"; null when it could not be described. */
  description: string | null;
  /** false when no Gemini key is set. */
  available: boolean;
}

/** GET /v1/studio/catalog/jobs — history, newest first, 20 at a time. */
export const catalogJobsQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Only the jobs started from this design's Images tab. */
  designId: z.string().uuid().optional(),
});

// ───────────── From a design's Images tab ("Make with AI") ─────────────

/** POST /v1/studio/catalog/designs/:designId/photoshoot — the design's primary photo on a saved model. */
export const designPhotoshootBody = createMasterBody.innerType().omit({ abayaPath: true, abayaImageId: true, backPath: true });
/** POST /v1/studio/catalog/designs/:designId/edits — one change to the design's primary photo. */
export const designEditBody = createEditBody;
/** POST /v1/studio/catalog/designs/:designId/reframe — the primary photo in another shape (e.g. landscape for the hero). */
export const designReframeBody = createReframeBody;

/** POST /v1/studio/catalog/presets — a saved designer direction, shared with the team. */
export const createPromptPresetBody = z.object({
  name: z.string().trim().min(2).max(60),
  text: z.string().trim().min(3).max(400),
});

/** PATCH /v1/studio/catalog/images/:id — approve / reject with reasons and scores. */
export const reviewCatalogImageBody = z
  .object({
    review: z.enum(['APPROVED', 'REJECTED']),
    reasons: z.array(z.enum(CATALOG_REJECT_REASONS)).max(13).default([]),
    scores: z
      .object({
        garmentFidelity: score,
        fabricFidelity: score,
        embroideryFidelity: score,
        modelRealism: score,
        poseQuality: score,
        backgroundQuality: score,
      })
      .optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.review === 'APPROVED' || b.reasons.length > 0, { message: 'Choose at least one reason', path: ['reasons'] });
export type ReviewCatalogImageBody = z.input<typeof reviewCatalogImageBody>;

/** POST /v1/studio/catalog/images/:id/design — use an approved image as a design photo. */
export const useCatalogImageBody = z.object({
  designId: z.string().uuid(),
  /** Make it the design's main (cover) photo in the shop. */
  primary: z.boolean().default(false),
  /** The COLOUR option value the photo shows; customers see it when they pick that colour. */
  colourValueId: z.string().uuid().optional(),
});

/** POST /v1/studio/catalog/images/:id/new-design — a new draft design with this image as its main photo. */
export const newDesignFromCatalogImageBody = z.object({
  name: z.string().trim().min(3).max(100),
  style: z.enum(ABAYA_STYLES),
  description: z.string().trim().max(2000).optional(),
});

/** POST /v1/studio/catalog/designs/:designId/images — add a whole approved set, in this order. */
export const addCatalogSetBody = z.object({
  imageIds: z.array(z.string().uuid()).min(1).max(12),
  /** One of imageIds to become the main photo. */
  primaryImageId: z.string().uuid().optional(),
  /** The COLOUR option value the whole set shows; customers see it when they pick that colour. */
  colourValueId: z.string().uuid().optional(),
});
export interface AddCatalogSetResponse {
  added: number;
  /** Already in this design, so not added again. */
  skipped: number;
}

// ───────────── Responses ─────────────

export interface CatalogImageDto {
  id: string;
  jobId: string;
  url: string;
  review: CatalogReview;
  reasons: CatalogRejectReason[];
  scores: CatalogScores | null;
  note: string | null;
  flags: string[];
  designId: string | null;
  retriesLeft: number;
}

export interface CatalogJobDto {
  id: string;
  kind: CatalogJobKind;
  view: CatalogView;
  endpoint: string;
  status: CatalogJobStatus;
  /** Shown while it runs ("Generating master…"). */
  stage: string;
  editType: CatalogEditType | null;
  instruction: string | null;
  /** Abaya style, embroidery placement and designer direction given with the master. */
  style: AbayaStyle | null;
  embroidery: EmbroideryPlacement[];
  direction: string | null;
  /** The master was made from the designer's sketch. */
  sketch: boolean;
  /** Design reference photos given with the master (apply them with a design edit). */
  references: { type: DesignReferenceType; path: string; url: string; note: string | null }[];
  prompt: string;
  resolution: CatalogResolution;
  mode: CatalogMode;
  numImages: number;
  seed: number;
  credits: number;
  modelProfileId: string | null;
  parentImageId: string | null;
  retryOfImageId: string | null;
  /** Runs after this job finishes (references applied automatically, one after another). */
  afterJobId: string | null;
  /** The design this was started from (Images tab → Make with AI), else null. */
  designId: string | null;
  inputs: { abayaUrl: string | null; backUrl: string | null; modelUrl: string | null; sourceUrl: string | null };
  provider: 'fashn' | 'test';
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  images: CatalogImageDto[];
}

export interface CatalogPromptPresetDto {
  id: string;
  name: string;
  text: string;
  createdBy: { id: string; name: string | null };
  createdAt: string;
}

export interface CatalogModelProfileDto {
  id: string;
  name: string;
  type: 'AI' | 'PERSONAL';
  /** How many different abayas this model has already worn (each abaya should get a new face). */
  abayaCount: number;
  imageUrl: string;
  description: string | null;
  createdBy: { id: string; name: string | null };
  createdAt: string;
}

export interface CatalogLimitsDto {
  mode: 'live' | 'test';
  /** FASHN account balance (null in test mode or when FASHN does not answer). */
  balance: number | null;
  usedToday: number;
  dailyLimit: number;
}
