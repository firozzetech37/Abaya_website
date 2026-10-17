/**
 * Website AI preview and try-on rules (plain TypeScript): which design photo is edited, which
 * choices go in the prompt, the FASHN request, and what the customer is told when it fails.
 */
import {
  bodyBuild,
  type CustomerPreviewKind,
  madeToMeasurePrompt,
  modelLikeMePrompt,
  type OptionGroupCode,
  type PreviewChoice,
  type PreviewPlan,
  planPreview,
  type TryOnBackground,
  type TryOnBody,
  type TryOnMode,
  TRYON_RETENTION_DAYS,
  TRYON_PHOTO_PROBLEMS,
  type TryOnPhotoProblem,
} from '@abaya/contracts';

/** At most this many customer requests run at FASHN at once (the designers' AI Catalog shares the account). */
export const CUSTOMER_FASHN_CONCURRENCY = 3;
/** How often FASHN is asked whether a picture is ready (it takes 20–80 s). */
export const POLL_INTERVAL_MS = 1_500;
export const JOB_TIMEOUT_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 3;
export const INPUT_URL_TTL_SECONDS = 3_600;
/** The design photo FASHN gets for a try-on: plenty for its 1k output, a fraction of a 7–10 MB original. */
export const TRYON_SOURCE_SIDE = 2048;
/** Images Gemini gets for the try-on accuracy check: embroidery stays readable, the upload stays small. */
export const TRYON_CHECK_SIDE = 1536;
export const retryDelayMs = (attempt: number): number => 10_000 * attempt;

export const ENDPOINT: Record<CustomerPreviewKind, string> = { PREVIEW: 'edit', TRYON: 'tryon-max' };

/**
 * The try-on instruction and what the result must show. Only the abaya moves across: never
 * the product model's bag, shoes or headscarf; her face, body, pose, headscarf and background stay.
 */
export interface TryOnPlan {
  /** One prompt per FASHN step. */
  steps: string[];
  /** The FASHN endpoint of each step. */
  endpoints: string[];
  checks: PreviewCheck[];
}

/**
 * The FASHN steps of a try-on:
 * - PHOTO: tryon-max on her photo; with her measurements, then an edit to the made-to-measure
 *   length and sleeves.
 * - MODEL ("a model like me"): model-create with her build, then tryon-max on that model.
 */
export function tryOnPlan(
  style: string,
  options: { mode?: TryOnMode; body?: TryOnBody | null; background?: string | null; figure?: TryOnBody | null } = {},
): TryOnPlan {
  const plan = basePlan(style, options);
  const background = options.background?.trim();
  if (!background) return plan;
  // A new background: one last edit that changes only the scene behind her.
  const resultImage = `image ${options.mode === 'MODEL' ? 2 : 3}`;
  return {
    steps: [...plan.steps, backgroundPrompt(background)],
    endpoints: [...plan.endpoints, ENDPOINT_EDIT],
    checks: [
      // Her own photo's background is no longer expected...
      ...plan.checks.map((c) => ({ ...c, text: c.text.replace(' pose and background ', ' pose ') })),
      // ...the chosen one is.
      { text: `The background of ${resultImage} shows ${background}.`, critical: false },
    ],
  };
}

/** The ready-made backgrounds, as the image editor is told them. */
export const BACKGROUND_SCENES: Record<TryOnBackground, string> = {
  studio: 'a luxury fashion studio with a soft cream seamless backdrop and gentle, even studio lighting',
  courtyard: 'an old Arabian courtyard with sand-coloured walls, stone arches and carved wooden doors, in warm afternoon light',
  desert: 'golden desert dunes at sunset with soft warm light and a clear sky',
  marble: 'an elegant modern hall with polished cream marble floors and walls and soft daylight',
  garden: 'a lush rose garden with blooming roses and green hedges in soft morning light',
  skyline: 'a rooftop terrace at dusk with a glittering city skyline behind her',
};

/** The background-only edit: the woman and the abaya stay exactly as they are. */
export function backgroundPrompt(scene: string): string {
  return [
    `Replace only the background with ${scene}.`,
    'Keep the woman exactly as she is: her face, facial features, skin tone, hair or hijab, body shape, pose and hands.',
    'Keep the abaya exactly as it is: the same cut, colours, fabric, drape, and every embroidery panel, border and motif.',
    'Keep her full length in the frame, at the same size and position.',
    'Match the light, colour and shadows on her to the new background so it looks like one real photograph, with her feet standing naturally on the ground.',
  ].join(' ');
}

/** What a customer may type for her background: a place, scenery, light or mood, nothing else. */
export function backgroundQuestion(text: string): string {
  return [
    'A customer is trying on an abaya with AI and typed the background she wants behind her in the picture.',
    'Allowed: a place, setting, scenery, landmark, room, weather, season, time of day, light or mood.',
    'Not allowed: anything about her own body, face, pose or clothes; any change to the abaya; other people or animals; objects for her to hold; text, logos or brands; anything offensive, sexual or violent.',
    `Her words: <<<${text}>>>`,
    'Answer with JSON only: {"kept": "the allowed background, rewritten in English as a short scene description for an image editor (empty when nothing is allowed)", "leftOut": ["each part left out, in a few words"]}.',
  ].join('\n\n');
}
export const BACKGROUND_NOT_ALLOWED = 'The background can be a place, a setting, the light or the mood. Please describe only the scene behind you.';

/** Her figure in words, from her measurements ("She is tall with a full, curvy build and gentle curves."). */
export function figureLine(b: TryOnBody): string {
  const { height, build, shape } = bodyBuild(b);
  return `She is ${height} (${b.heightCm} cm) with ${build}${shape ? ` and ${shape}` : ''}.`;
}

function basePlan(style: string, options: { mode?: TryOnMode; body?: TryOnBody | null; figure?: TryOnBody | null }): TryOnPlan {
  const shape = style.toLowerCase().replace(/_/g, ' ');
  const mode = options.mode ?? 'PHOTO';
  const body = options.body ?? null;
  // Her measurements (made to measure, or saved on her account) describe her figure for the fit.
  const known = body ?? options.figure ?? null;
  const dress = (who: string) =>
    [
      `Dress ${who} in this ${shape} abaya, full length to her ankles, worn open or closed exactly as in the product photo.`,
      'Replace her own outfit completely: remove her shawl, dupatta, stole, any scarf draped over her shoulders or chest, her jacket, cardigan or coat, and her top. None of her own clothes may show.',
      'If the abaya is open at the front, she wears the same plain inner dress underneath as the product model, in the same colour.',
      'Keep only a hijab that covers her hair, if she wears one; otherwise keep her hair as it is.',
      'Transfer ONLY the abaya and its inner dress: do not copy the product model’s handbag, shoes, jewellery or headscarf.',
      `Keep the abaya’s design exactly: its ${shape} cut, fabric, colours and every embroidery panel, border and motif in the same place, size and pattern.`,
      'Fit the abaya to HER body, not to the product model’s: its shoulders sit on her shoulders, it falls over her own bust, waist and hips with natural ease, the hem reaches her ankles for her height and the sleeves end at her wrists. Embroidery panels follow her body in the same places as on the product.',
      ...(known && mode === 'PHOTO' ? [figureLine(known)] : []),
      'Keep her real body shape and size exactly as in her photo: do not slim, stretch, lengthen, shorten or reshape her body, and do not copy the product model’s proportions or height.',
      'Keep her face exactly as in her photo: the same facial features, expression, skin texture and skin tone. Do not beautify, smooth, retouch, slim or brighten her face.',
      'Keep her pose, head position, hands and the background exactly as in her photo.',
      'It must look like a real photograph of her: natural drape and folds that follow her body, real fabric texture.',
    ].join(' ');
  // Critical (a remake): the wrong garment, pattern or colour, or another woman's face. Everything
  // else is a detail: noted for the admin, never a remake (each remake costs her another minute).
  const garmentChecks = (result: string, original: string): PreviewCheck[] => [
    { text: `The abaya in ${result} has the same ${shape} silhouette as the abaya in ${original}.`, critical: true },
    {
      text: `The abaya in ${result} has the same kind of pattern or embroidery as in ${original}: not plain where ${original} is patterned, not a different design, and no buttons, prints or motifs that ${original} does not have.`,
      critical: true,
    },
    { text: `Every embroidery panel, border or motif of the abaya in ${original} is visible on the abaya in ${result}, in the same place and size.`, critical: false },
    { text: `The abaya in ${result} is the same colour as in ${original}.`, critical: true },
    { text: `The abaya in ${result} is full length, reaching her ankles.`, critical: false },
    { text: `She is not holding or wearing the product model’s handbag or shoes from ${original}.`, critical: false },
  ];

  if (mode === 'MODEL') {
    if (!body) throw new Error('A model try-on needs her measurements.');
    const { height, build } = bodyBuild(body);
    return {
      // Her height to the nearest 5 cm: women of the same height and build share one ready-made model.
      steps: [modelLikeMePrompt({ ...body, heightCm: modelHeight(body.heightCm) }), dress('the woman in the photo')],
      endpoints: [ENDPOINT_MODEL, ENDPOINT.TRYON],
      checks: [
        ...garmentChecks('image 2', 'image 1'),
        { text: `The woman in image 2 is ${height} with ${build}, wearing a hijab.`, critical: false },
      ],
    };
  }
  const checks: PreviewCheck[] = [
    { text: 'The woman in image 3 is clearly the same person as in image 2: the same face and skin tone.', critical: true },
    { text: 'The woman in image 3 has the same pose and background as in image 2.', critical: false },
    { text: 'None of her own clothes from image 2 (a shawl, dupatta or scarf over her shoulders, her top or jacket) are visible in image 3: only the abaya, its inner dress and a hijab.', critical: true },
    { text: 'The woman in image 3 has the same body shape, size and proportions as in image 2 (not slimmed, stretched or reshaped), and the abaya is fitted to her body: its shoulders on her shoulders, the hem at her ankles, the sleeves at her wrists.', critical: false },
    ...garmentChecks('image 3', 'image 1'),
  ];
  if (!body) return { steps: [dress('the woman in her photo')], endpoints: [ENDPOINT.TRYON], checks };
  return {
    steps: [dress('the woman in her photo'), madeToMeasurePrompt(body, style)],
    endpoints: [ENDPOINT.TRYON, ENDPOINT_EDIT],
    checks: [...checks, { text: 'In image 3 the hem falls just above the floor and the sleeves end at her wrists.', critical: false }],
  };
}

/** FASHN's "create a model" step ("a model like me"); its picture is kept and reused (TryOnWorker). */
export const ENDPOINT_MODEL = 'model-create';
const ENDPOINT_EDIT = 'edit';

/** Height of the made-up model: hers to the nearest 5 cm, so the ready-made models are reused. */
export const modelHeight = (heightCm: number): number => Math.round(heightCm / 5) * 5;

/**
 * The steps of a remake: the problems the check found go into every step that dresses or edits
 * her, never into the model step (the same model is reused, ready-made).
 */
export function remadeSteps(steps: string[], endpoints: string[], defaultEndpoint: string, fix: string): string[] {
  return steps.map((s, i) => ((endpoints[i] ?? defaultEndpoint) === ENDPOINT_MODEL ? s : `${s} ${fix}`));
}

/** Kept for rows made before the try-on plan (one instruction). */
export const TRYON_PROMPT = tryOnPlan('abaya').steps[0]!;

/** Start of the current day in India (UTC+5:30), for daily limits. */
export function startOfIndiaDay(now: Date): Date {
  const offset = 330 * 60_000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

export const tryOnExpiry = (now: Date): Date => new Date(now.getTime() + TRYON_RETENTION_DAYS * 24 * 60 * 60_000);

export interface SubjectImage {
  storagePath: string;
  colourValueId: string | null;
}
export interface SubjectOption {
  id: string;
  groupCode: OptionGroupCode;
  name: string;
  description: string | null;
  isDefault: boolean;
}

/**
 * The photo to start from: the chosen colour's own photo when there is one, else the main
 * photo. `showsColour` says whether that photo already shows the chosen colour.
 */
export function sourceImage(
  images: SubjectImage[],
  options: SubjectOption[],
  colourId: string | null,
): { image: SubjectImage; showsColour: boolean } | null {
  const ofColour = colourId ? images.find((i) => i.colourValueId === colourId) : undefined;
  if (ofColour) return { image: ofColour, showsColour: true };
  const main = images.find((i) => !i.colourValueId) ?? images[0];
  if (!main) return null;
  // The main photoshoot shows the design's default colour.
  const defaultColour = options.find((o) => o.groupCode === 'COLOUR' && o.isDefault)?.id ?? null;
  return { image: main, showsColour: !colourId || colourId === defaultColour };
}

/**
 * What the edit must change: every chosen value that the photo does not already show
 * (the photo shows the design's defaults). Colour only when the photo is another colour.
 */
export function changesToShow(
  options: SubjectOption[],
  selectedIds: string[],
  showsColour: boolean,
): PreviewChoice[] {
  const chosen = new Set(selectedIds);
  return options
    .filter((o) => chosen.has(o.id) && !o.isDefault)
    .filter((o) => o.groupCode !== 'COLOUR' || !showsColour)
    .map((o) => ({ group: o.groupCode, name: o.name, description: o.description }));
}

/** The steps and checks for a preview: the chosen colour (or the default one) names the accessories. */
export function previewPlan(style: string, options: SubjectOption[], selectedIds: string[], changes: PreviewChoice[], request?: string | null): PreviewPlan {
  const colours = options.filter((o) => o.groupCode === 'COLOUR');
  const colour = colours.find((o) => selectedIds.includes(o.id)) ?? colours.find((o) => o.isDefault);
  return planPreview({ style, colourName: colour?.name ?? 'same', choices: changes, request });
}

// ───────────── Accuracy check ─────────────

/** A preview that fails the check is remade once with the problems named; then it is refused. */
export const MAX_CHECK_RETRIES = 1;

/** What a customer's free-text wish may do to a preview. Gemini answers before the image model is called. */
export function requestQuestion(request: string): string {
  return [
    'A customer is previewing an abaya (a long modest garment) and typed a wish for the AI picture. The picture may ONLY change surface things: the fabric look or sheen, the fabric colour, the colour of the existing embroidery or pattern thread, the background, the setting, the lighting, the time of day or the mood.',
    'It must NOT change the design: no changes to the cut, silhouette, length, sleeves, neckline, closure, the pattern or print itself, embroidery, lace, borders, trims, motifs, adding or removing any element (accessories, bags, jewellery, props held by the model), the model’s body, face or pose, or any text/logo. Parts that are offensive, about nudity, or unrelated to the picture are not allowed either.',
    'Split the wish: keep the allowed parts as one clean sentence in the language of the wish (English or Arabic), and list each part you left out in a few words. If nothing is allowed, "kept" is an empty string.',
    `Wish: <<<${request}>>>`,
    'Answer with JSON only: {"kept": "the allowed parts, reworded as one clear instruction for an image editor", "leftOut": ["each part left out"]}.',
  ].join('\n\n');
}
export const REQUEST_NOT_ALLOWED = 'The preview can change the fabric, colours, background and lighting. The design itself stays as our designer made it. Please rephrase your wish.';
/** Stored in the preview's `choices` so the result can say what was used and what was left out. */
/**
 * The first choice line of a "a model like me" try-on (no photo of her: a made-up model with her
 * height and size). These are kept for the admin like previews; photo try-ons never are.
 */
export const MODEL_TRYON_LINE = 'Try-on: a model like me';
export const WORDS_LINE = 'In her words: ';
export const LEFT_OUT_LINE = 'Left out: ';
export const REQUEST_UNAVAILABLE = 'Wishes in your own words are not available right now. Please use the options instead.';
export const INACCURATE_TRYON_MESSAGE =
  'We couldn’t make an accurate try-on with this photo. Please try a different photo: standing, facing the camera, whole body visible, good light.';
export const INACCURATE_MESSAGE =
  'We couldn’t make an accurate preview of this combination. Your abaya will still be made exactly to your choices.';

/** A try-on shown before its accuracy check (its `checkNotes` until the check answers). */
export const CHECKING_NOTE = 'Checking';
/** A try-on whose better version failed the check too: the first picture stays (details may differ). */
export const FAILED_TWICE_NOTE = 'Failed twice';

export type PreviewCheck = { text: string; critical: boolean };
export type CheckAnswer = { ok: boolean; problem: string };

/** The question Gemini answers about the original photo (first image) and the preview (second). */
export function checkQuestion(checks: PreviewCheck[]): string {
  const list = checks.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
  return [
    'You are a strict fashion quality checker. Image 1 is the original product photo of an abaya. Image 2 is an AI-edited version that should show the customer’s chosen changes.',
    'For each statement below, decide whether it is true for image 2 (compare with image 1 where needed). Be strict about embroidery: if embroidery panels, borders or motifs from image 1 are missing, moved, much smaller or turned into a different pattern in image 2, that is false.',
    list,
    'Answer with JSON only: {"results":[{"n":1,"ok":true,"problem":""}, ...]} with one entry per statement; "problem" says in a few words what is wrong when ok is false.',
  ].join('\n\n');
}

/**
 * Pass when every critical check is true and at most `maxMinor` details are off (a preview: one,
 * since its details are her chosen options; a try-on: any, since only serious problems are worth
 * another minute of her waiting). Missing answers count as passed (the checker could not tell).
 */
export function judge(checks: PreviewCheck[], answers: CheckAnswer[], maxMinor = 1): { pass: boolean; problems: string[] } {
  const failed = checks
    .map((c, i) => ({ check: c, answer: answers[i] }))
    .filter((x) => x.answer && !x.answer.ok);
  const problems = failed.map((x) => `${x.check.text.replace(/\.$/, '')}: ${x.answer!.problem || 'not shown'}.`);
  const criticalFailed = failed.some((x) => x.check.critical);
  return { pass: !criticalFailed && failed.filter((x) => !x.check.critical).length <= maxMinor, problems };
}

/** "Fabric: Crepe" lines for the admin list. */
export function choiceLines(options: SubjectOption[], selectedIds: string[]): string[] {
  const label = (g: OptionGroupCode) => g.charAt(0) + g.slice(1).toLowerCase().replace('_', '-');
  const chosen = new Set(selectedIds);
  return options.filter((o) => chosen.has(o.id)).map((o) => `${label(o.groupCode)}: ${o.name}`);
}

/**
 * The `inputs` of POST /v1/run for one step (always 1K fast, one image). `source` is the design
 * photo (or her customised preview), `working` the previous step's picture, `person` her photo.
 */
/** The try-on's FASHN quality: balanced keeps embroidery and faces closer than fast. */
export const TRYON_GENERATION_MODE = 'balanced';

/** FASHN credits one step costs: a balanced try-on 2, everything else (1k, fast) 1. */
export const stepCredits = (endpoint: string): number => (endpoint === ENDPOINT.TRYON ? 2 : 1);
/** Credits of all the steps of a request. */
export const planCredits = (endpoints: string[]): number => endpoints.reduce((n, e) => n + stepCredits(e), 0);

export function fashnInputs(
  endpoint: string,
  prompt: string,
  urls: { source: string; working?: string; person?: string },
): Record<string, unknown> {
  const common = { resolution: '1k', generation_mode: 'fast', num_images: 1, output_format: 'png' };
  // Try-ons use "balanced": the embroidery comes out far more faithful (2 credits instead of 1).
  // Try-on pictures come back as JPEG: smaller to download and watermark (the shown picture is a JPEG anyway).
  if (endpoint === ENDPOINT_MODEL) return { prompt, aspect_ratio: '4:5', ...common, output_format: 'jpeg' };
  if (endpoint === ENDPOINT.TRYON) {
    // Her photo, or (a model like me) the model the previous step made.
    const model = urls.person ?? urls.working;
    if (!model) throw new Error('A try-on needs a photo of the person.');
    return { product_image: urls.source, model_image: model, prompt, ...common, generation_mode: TRYON_GENERATION_MODE, output_format: 'jpeg' };
  }
  return { image: urls.working ?? urls.source, prompt, ...common };
}

/** The Gemini question for "a model like me": image 1 the abaya, image 2 the result. */
export function modelTryOnCheckQuestion(checks: PreviewCheck[]): string {
  const list = checks.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
  return [
    'You are a strict fashion quality checker for a virtual try-on on an AI model. Image 1 is the abaya product photo. Image 2 is the AI result that should show a model wearing the abaya from image 1.',
    'For each statement below decide whether it is true. Be strict about embroidery (missing, moved or redrawn embroidery is false).',
    list,
    'Answer with JSON only: {"results":[{"n":1,"ok":true,"problem":""}, ...]} with one entry per statement; "problem" says in a few words what is wrong when ok is false.',
  ].join('\n\n');
}

const TEMPORARY = new Set(['ThirdPartyError', 'UnavailableError', 'PipelineError', 'InternalServerError']);
export const isTemporaryFailure = (name: string): boolean => TEMPORARY.has(name);

/** What the customer reads; never the provider's own text. */
export function customerError(name: string): string {
  switch (name) {
    case 'ImageLoadError':
    case 'InputValidationError':
      return 'We could not read the photo. Please use a clear JPEG or PNG photo, standing, full length.';
    case 'ContentModerationError':
      return 'We could not make this picture. Please try a different photo.';
    case 'OutOfCredits':
    case 'UnauthorizedAccess':
      return 'AI pictures are not available right now. Please try again later.';
    case 'Timeout':
      return 'This took too long. Please try again.';
    default:
      return 'The picture could not be made. Please try again.';
  }
}

/** Gemini's question for a try-on: image 1 the abaya, image 2 her photo, image 3 the result. */
export function tryOnCheckQuestion(checks: PreviewCheck[]): string {
  const list = checks.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
  return [
    'You are a strict fashion quality checker for a virtual try-on. Image 1 is the abaya product photo. Image 2 is the customer’s own photo. Image 3 is the AI try-on result that should show the customer from image 2 wearing the abaya from image 1.',
    'For each statement below decide whether it is true. Be strict about the person (it must be the same woman, not a different face or body) and about embroidery (missing, moved or redrawn embroidery is false).',
    list,
    'Answer with JSON only: {"results":[{"n":1,"ok":true,"problem":""}, ...]} with one entry per statement; "problem" says in a few words what is wrong when ok is false.',
  ].join('\n\n');
}

// ───────────── Her photo, checked before any credit is spent ─────────────

/**
 * Strict on purpose: a try-on on a sitting, cropped or half-body photo cannot come out right, and
 * would otherwise cost two FASHN runs and minutes of waiting before it fails.
 */
export const PHOTO_QUESTION = [
  'You check a customer photo before a virtual try-on of a full-length abaya. Be strict: the try-on only works when ALL of these are true.',
  [
    '1. Exactly one person is in the photo.',
    '2. She is standing upright: not sitting, kneeling, crouching, lying down or leaning on something.',
    '3. Her whole body is in the frame, from the top of her head down to her feet; nothing is cut off at the top or the bottom.',
    '4. She faces the camera (straight on or slightly turned), not her back or a full side view.',
    '5. Her face is not blocked by a phone, hand or object. A hijab, niqab or face veil is fine.',
    '6. The photo is reasonably lit and sharp. A mirror selfie is fine if all of the above are true.',
  ].join('\n'),
  `Answer with JSON only: {"ok":true|false,"reason":"${['ok', ...TRYON_PHOTO_PROBLEMS].join('|')}"} giving the FIRST problem you see.`,
  'Reasons: "sitting" = not standing upright; "cropped" = a full-length photo with her head or feet cut off; "half_body" = only her upper body, or down to her waist or knees; "not_facing" = her back or side to the camera; "multiple_people" = more than one person; "no_person" = no person; "face_hidden" = face blocked by an object; "too_dark"; "blurry".',
].join('\n\n');

/** Her photo check's answer as a problem code; null for an answer we do not know. */
export function photoProblem(reason: string): TryOnPhotoProblem | null {
  if ((TRYON_PHOTO_PROBLEMS as readonly string[]).includes(reason)) return reason as TryOnPhotoProblem;
  // Older answers.
  if (reason === 'not_full_body') return 'half_body';
  if (reason === 'not_standing') return 'sitting';
  return null;
}

/** What she is told when her photo will not work (no credit is used). */
export function photoTip(reason: string): string {
  switch (photoProblem(reason)) {
    case 'sitting':
      return 'You are sitting in this photo. Please use one where you are standing.';
    case 'cropped':
      return 'Part of you is cut off in this photo. Please use one that shows you from head to feet.';
    case 'half_body':
      return 'This photo shows only part of you. Please step back so your whole body fits, from head to feet.';
    case 'not_facing':
      return 'Please use a photo where you face the camera.';
    case 'multiple_people':
      return 'Please use a photo with only you in it.';
    case 'no_person':
      return 'We could not find a person in this photo. Please use a photo of yourself, standing.';
    case 'face_hidden':
      return 'Your face is covered by something in this photo. Please use one where nothing is in front of your face.';
    case 'too_dark':
      return 'This photo is too dark. Please use one taken in good light.';
    case 'blurry':
      return 'This photo is blurry. Please use a sharp one.';
    default:
      return 'This photo will not work well for a try-on. Please use one where you stand facing the camera, whole body visible, in good light.';
  }
}
