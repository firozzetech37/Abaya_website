/**
 * AI Catalog rules (plain TypeScript): how a saved job becomes a FASHN request, what the
 * designer sees while it runs, and which FASHN failures are worth another try.
 */
import type {
  CatalogJobKind,
  CatalogJobStatus,
  CatalogMode,
  CatalogResolution,
  CatalogView,
} from '@abaya/contracts';

/** FASHN runs at most 6 predictions at once per account. */
export const FASHN_CONCURRENCY = 6;
/** Tries per job for temporary FASHN failures (failed predictions cost no credits). */
export const MAX_SUBMIT_ATTEMPTS = 3;
/** How often a running job is checked, and when we give up on it. */
export const POLL_INTERVAL_MS = 4_000;
export const JOB_TIMEOUT_MS = 10 * 60_000;
/** Signed links FASHN downloads the inputs from (long enough for a slow queue). */
export const INPUT_URL_TTL_SECONDS = 3_600;

export const retryDelayMs = (attempt: number): number => 15_000 * attempt;

/** Start of the current day in India (UTC+5:30), for the daily credit limit. */
export function startOfIndiaDay(now: Date): Date {
  const offset = 330 * 60_000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

export interface JobForRequest {
  kind: CatalogJobKind;
  view: CatalogView;
  prompt: string;
  resolution: CatalogResolution;
  mode: CatalogMode;
  numImages: number;
  seed: number;
  aspectRatio: string | null;
}

/** Signed URLs of the job's input images (only the ones it has). */
export interface SignedInputs {
  abaya?: string;
  model?: string;
  source?: string;
  back?: string;
  mask?: string;
  /** Reference photo for an edit (e.g. the designer's own background photo). */
  context?: string;
  face?: string;
  background?: string;
}

/** The `inputs` object of POST /v1/run for each FASHN endpoint (docs.fashn.ai). */
export function fashnInputs(job: JobForRequest, urls: SignedInputs): Record<string, unknown> {
  const common = {
    resolution: job.resolution,
    generation_mode: job.mode,
    num_images: job.numImages,
    seed: job.seed,
    output_format: 'png',
  };
  switch (job.kind) {
    case 'PRODUCT_TO_MODEL':
      return {
        product_image: required(urls.abaya, 'abaya'),
        prompt: job.prompt,
        aspect_ratio: job.aspectRatio ?? '4:5',
        ...(urls.face ? { face_reference: urls.face, face_reference_mode: 'match_reference' } : {}),
        ...(urls.background ? { background_reference: urls.background } : {}),
        ...common,
      };
    case 'MODEL_CREATE':
      return { prompt: job.prompt, aspect_ratio: job.aspectRatio ?? '4:5', ...common };
    case 'TRYON':
      return {
        product_image: required(urls.abaya, 'abaya'),
        model_image: required(urls.model, 'model'),
        prompt: job.prompt,
        ...common,
      };
    case 'EDIT':
      return {
        image: required(urls.source, 'source'),
        prompt: job.prompt,
        // The real back photo guides a back view; a reference photo guides an edit; masks focus it.
        ...(job.view === 'BACK' && urls.back
          ? { image_context: urls.back }
          : urls.context
            ? { image_context: urls.context }
            : {}),
        ...(urls.mask ? { mask: urls.mask } : {}),
        ...common,
      };
    case 'REFRAME':
      return {
        image: required(urls.source, 'source'),
        aspect_ratio: job.aspectRatio ?? '4:5',
        ...common,
      };
    case 'BACKGROUND_REMOVE':
      return { image: required(urls.source, 'source') };
  }
}

const required = (url: string | undefined, name: string): string => {
  if (!url) throw new Error(`Missing ${name} image`);
  return url;
};

const POSE_NAMES: Partial<Record<CatalogView, string>> = {
  FRONT: 'front pose',
  FRONT_2: 'second front pose',
  THREE_QUARTER: 'three-quarter pose',
  SIDE: 'side view',
  BACK: 'back view',
  EDITORIAL: 'editorial pose',
};

/** What the designer reads while a job is waiting or running. */
export function stageLabel(job: {
  status: CatalogJobStatus;
  view: CatalogView;
  resolution: CatalogResolution;
}): string {
  if (job.status === 'DONE') return 'Done';
  if (job.status === 'FAILED') return 'Failed';
  if (job.status === 'QUEUED') return 'Waiting for a free slot…';
  if (job.resolution === '4k' && (job.view === 'MASTER' || POSE_NAMES[job.view]))
    return 'Generating final 4K…';
  switch (job.view) {
    case 'MODEL':
      return 'Creating the model…';
    case 'MASTER':
      return 'Generating master…';
    case 'EDIT':
      return 'Applying the edit…';
    case 'REFRAME':
      return 'Reframing…';
    case 'CLEANUP':
      return 'Removing the background…';
    default:
      return `Generating ${POSE_NAMES[job.view] ?? 'image'}…`;
  }
}

/** Runtime errors FASHN reports that may pass on a retry. */
const TEMPORARY = new Set([
  'ThirdPartyError',
  'UnavailableError',
  'PipelineError',
  'InternalServerError',
]);
export const isTemporaryFailure = (name: string): boolean => TEMPORARY.has(name);

/** A message for the designer; never the raw provider text. */
export function friendlyError(name: string): string {
  switch (name) {
    case 'ImageLoadError':
      return 'FASHN could not read one of the images. Try a JPEG or PNG photo under 30 MB.';
    case 'ContentModerationError':
      return 'FASHN declined this request under its content rules. Try a different photo or prompt.';
    case 'InputValidationError':
      return 'FASHN did not accept these settings or images (check the photo size and shape).';
    case 'OutOfCredits':
      return 'The FASHN account has no credits left. Ask the admin to top up.';
    case 'UnauthorizedAccess':
      return 'The FASHN API key is not valid. Ask the admin to check FASHN_API_KEY.';
    case 'Timeout':
      return 'FASHN took too long. Please try again.';
    case 'PreviousStepFailed':
      return 'Not made: the step before it failed.';
    default:
      return 'The image could not be made. Please try again.';
  }
}

/** What to ask Gemini about each kind of reference photo (a few words for the prompt). */
export function describeInstruction(type: string): string {
  const what =
    type === 'FABRIC_COLOUR'
      ? 'the fabric: its exact colour shade, material look and sheen (e.g. "dusty mauve satin with a soft sheen")'
      : type === 'FABRIC_PATTERN'
        ? 'the print or pattern: motif, colours and scale (e.g. "small brown-and-cream paisley print")'
        : type === 'EMBROIDERY'
          ? 'the embroidery: technique, thread colours and motif (e.g. "silver zari floral vine")'
          : type === 'LACE_TRIM'
            ? 'the lace or trim: type, colour and width (e.g. "narrow ivory scalloped lace")'
            : type === 'CLOSURE'
              ? 'the buttons or closure: type, material and colour (e.g. "small gold round buttons")'
              : 'the main design detail shown';
  return `Describe ${what} in at most 12 words, for a fashion photo prompt. Answer with the description only, no full sentence, no preamble.`;
}
