import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** Every environment variable the API reads. Missing or malformed values stop the boot. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.string().min(1),

  // Supabase: database (via Prisma) and file storage only. Login is Clerk.
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET_DESIGNS: z.string().default('designs'),
  SUPABASE_STORAGE_BUCKET_PRIVATE: z.string().default('private'),

  // Clerk: login for every app. The API verifies Clerk session tokens and reads
  // email/phone for new users; roles stay in our own database.
  CLERK_SECRET_KEY: z.string().startsWith('sk_', 'must be a Clerk secret key (sk_test_… or sk_live_…)'),
  /** Optional PEM public key: verify tokens without a network call (Clerk → API keys → JWT public key). */
  CLERK_JWT_KEY: z.string().optional(),
  /** Web origins allowed to have issued a token (azp claim). Defaults to CORS_ORIGINS. Native apps send no azp. */
  CLERK_AUTHORIZED_PARTIES: csv,

  /** 'fake' = development-only simulated payments (no Razorpay account needed). Refused in production. */
  PAYMENT_PROVIDER: z.enum(['razorpay', 'fake']).default('razorpay'),
  // Required when PAYMENT_PROVIDER=razorpay (checked below).
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Abaya <orders@example.com>'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  // WhatsApp order updates (Phase 2): 'none' disables the channel.
  WHATSAPP_PROVIDER: z.enum(['none', 'interakt', 'gupshup']).default('none'),
  WHATSAPP_PROVIDER_API_KEY: z.string().optional(),
  GUPSHUP_SOURCE_NUMBER: z.string().optional(), // WhatsApp business number, digits with country code
  GUPSHUP_APP_NAME: z.string().optional(),
  /** Gupshup addresses templates by id: JSON map of our template name → Gupshup template id. */
  WHATSAPP_TEMPLATE_IDS: z.string().optional(),

  // Expo push (customer app). The access token is optional (Expo "enhanced security").
  PUSH_ENABLED: bool.default('true'),
  EXPO_ACCESS_TOKEN: z.string().optional(),

  /** Background sender for the notification outbox. Off in tests (they drive it directly). */
  NOTIFY_WORKER_ENABLED: bool.optional(),
  // Studio AI design generation (docs/apps/studio.md). Without a key it runs in test mode
  // (placeholder images), so the whole flow works before the real model is connected.
  AI_IMAGE_PROVIDER: z.enum(['gemini', 'test']).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** "Nano Banana 2" = gemini-3.1-flash-image (gemini-2.5-flash-image has been retired). */
  AI_IMAGE_MODEL: z.string().min(1).default('gemini-3.1-flash-image'),
  /**
   * Gemini model that reads images and answers in text (free tier), e.g. to describe fabric photos
   * and check previews. gemini-2.5-flash is no longer offered to new keys; 3.x models think by
   * default, so short JSON answers are asked with thinking off.
   */
  GEMINI_TEXT_MODEL: z.string().min(1).default('gemini-3.8-flash'),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(500).default(20),
  AI_IMAGES_PER_GENERATION: z.coerce.number().int().min(1).max(6).default(4),
  STUDIO_WORKER_ENABLED: bool.optional(),
  // AI Catalog (FASHN, docs/apps/studio.md "AI Catalog"). Without a key it runs in test mode.
  FASHN_API_KEY: z.string().min(1).optional(),
  /** FASHN credits one designer may spend per day (India time). */
  FASHN_DAILY_CREDIT_LIMIT: z.coerce.number().int().min(1).max(5000).default(40),
  CATALOG_WORKER_ENABLED: bool.optional(),
  // Website AI preview and try-on (FASHN, docs/apps/web.md "AI preview and try-on").
  CUSTOMER_PREVIEW_DAILY_LIMIT: z.coerce.number().int().min(0).max(100).default(5),
  CUSTOMER_TRYON_DAILY_LIMIT: z.coerce.number().int().min(0).max(100).default(3),
  /** FASHN credits all customers together may use per day (India time). */
  CUSTOMER_AI_DAILY_CREDIT_LIMIT: z.coerce.number().int().min(0).max(100000).default(200),
  /** A customer sees each AI preview or try-on for this many minutes after she got it; then it is deleted. */
  CUSTOMER_AI_KEEP_MINUTES: z.coerce.number().int().min(5).max(7 * 24 * 60).default(60),
  /**
   * Previews and "a model like me" try-ons (no customer photo) stay this many days for the admin's
   * Customer AI previews page, though the customer still sees each one for CUSTOMER_AI_KEEP_MINUTES.
   * Try-ons on her own photo (her face and body) are always deleted after CUSTOMER_AI_KEEP_MINUTES.
   */
  CUSTOMER_AI_PREVIEW_KEEP_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  TRYON_WORKER_ENABLED: bool.optional(),
  /** Remake old customer web previews (e.g. watermarked ones) when the API starts. Off in tests. */
  PREVIEW_REFRESH_ON_START: bool.optional(),
  // Display currency (docs/apps/web.md "Currency"): everything is charged in INR; AED is converted for display.
  /** Free daily INR → AED feed (no key). Off in tests: the fallback rate is used. */
  FX_LIVE_ENABLED: bool.optional(),
  FX_RATE_URL: z.string().url().default('https://open.er-api.com/v6/latest/INR'),
  /** Dirhams per rupee when the feed is unreachable (≈ 0.038 in 2026). */
  FX_AED_PER_INR: z.coerce.number().positive().max(1).default(0.038),
  /** Saudi riyals per rupee when the feed is unreachable (≈ 0.039 in 2026; a riyal is worth a little less than a dirham). */
  FX_SAR_PER_INR: z.coerce.number().positive().max(1).default(0.039),
  /** Company Pinterest account (boards to browse). Without it, designers paste pin links. */
  PINTEREST_ACCESS_TOKEN: z.string().min(1).optional(),

  /** Hourly sweep that closes checkouts unpaid after 24 h. Off in tests (they call runOnce). */
  CHECKOUT_EXPIRY_ENABLED: bool.optional(),
  /** Bag, checkout and HD downloads; off while the shop shows "Ordering coming soon" (previews and try-ons still work). */
  ORDERING_ENABLED: bool.optional(),

  // AI service (services/ai, Step 15). Leave AI_SERVICE_URL empty to turn the AI assistant off.
  AI_SERVICE_URL: z.string().url().optional(),
  AI_SERVICE_TOKEN: z.string().optional(),
  /** Background analysis of queued images. Off in tests (they drive it directly). */
  AI_WORKER_ENABLED: bool.optional(),
  /** Visual similarity (0-1) at which two images count as a likely duplicate / as similar. */
  AI_DUPLICATE_THRESHOLD: z.coerce.number().min(0.5).max(1).default(0.96),
  AI_SIMILAR_THRESHOLD: z.coerce.number().min(0.5).max(1).default(0.93),

  // Staff must log in with a second factor (Supabase MFA, JWT aal2). Defaults on in production.
  STAFF_MFA_REQUIRED: bool.optional(),

  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & {
  STAFF_MFA_REQUIRED: boolean;
  NOTIFY_WORKER_ENABLED: boolean;
  AI_WORKER_ENABLED: boolean;
  CHECKOUT_EXPIRY_ENABLED: boolean;
  ORDERING_ENABLED: boolean;
  STUDIO_WORKER_ENABLED: boolean;
  CATALOG_WORKER_ENABLED: boolean;
  TRYON_WORKER_ENABLED: boolean;
  PREVIEW_REFRESH_ON_START: boolean;
  AI_IMAGE_PROVIDER: 'gemini' | 'test';
};

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings as missing so `KEY=""` in .env falls back to defaults.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  // Hosts such as Render and Railway tell the app which port to use via PORT.
  if (!cleaned.API_PORT && cleaned.PORT) cleaned.API_PORT = cleaned.PORT;
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid API environment. Fix these values in .env:\n${problems}`);
  }
  const env = result.data;
  // A live site may run without Razorpay only while ordering is closed ("Ordering coming soon"):
  // nothing can be bought, and simulated payments stay off in production (payments.module.ts).
  if (env.PAYMENT_PROVIDER === 'fake' && env.NODE_ENV === 'production' && env.ORDERING_ENABLED === true) {
    throw new Error(
      'Invalid API environment. PAYMENT_PROVIDER=fake is for development only; use razorpay in production (it is allowed only while ORDERING_ENABLED is off).',
    );
  }
  if (env.PAYMENT_PROVIDER === 'razorpay') {
    const missing = (['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const).filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `Invalid API environment. Fix these values in .env (or set PAYMENT_PROVIDER=fake for local testing):\n${missing.map((k) => `  - ${k}`).join('\n')}`,
      );
    }
  }
  const whatsappProblems: string[] = [];
  if (env.WHATSAPP_PROVIDER !== 'none' && !env.WHATSAPP_PROVIDER_API_KEY) whatsappProblems.push('WHATSAPP_PROVIDER_API_KEY');
  if (env.WHATSAPP_PROVIDER === 'gupshup') {
    if (!env.GUPSHUP_SOURCE_NUMBER) whatsappProblems.push('GUPSHUP_SOURCE_NUMBER');
    if (!env.GUPSHUP_APP_NAME) whatsappProblems.push('GUPSHUP_APP_NAME');
    if (!env.WHATSAPP_TEMPLATE_IDS) whatsappProblems.push('WHATSAPP_TEMPLATE_IDS');
  }
  if (whatsappProblems.length > 0) {
    throw new Error(
      `Invalid API environment. WHATSAPP_PROVIDER=${env.WHATSAPP_PROVIDER} also needs:\n${whatsappProblems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
  if (env.AI_SERVICE_URL) {
    const minLength = env.NODE_ENV === 'production' ? 24 : 1;
    if ((env.AI_SERVICE_TOKEN ?? '').length < minLength) {
      throw new Error(
        `Invalid API environment. AI_SERVICE_URL is set, so AI_SERVICE_TOKEN is needed too${minLength > 1 ? ` (at least ${minLength} characters in production)` : ''}.`,
      );
    }
  }
  if (env.AI_SIMILAR_THRESHOLD > env.AI_DUPLICATE_THRESHOLD) {
    throw new Error('Invalid API environment. AI_SIMILAR_THRESHOLD must not be higher than AI_DUPLICATE_THRESHOLD.');
  }
  return {
    ...env,
    STAFF_MFA_REQUIRED: env.STAFF_MFA_REQUIRED ?? env.NODE_ENV === 'production',
    NOTIFY_WORKER_ENABLED: env.NOTIFY_WORKER_ENABLED ?? env.NODE_ENV !== 'test',
    AI_WORKER_ENABLED: env.AI_WORKER_ENABLED ?? env.NODE_ENV !== 'test',
    CHECKOUT_EXPIRY_ENABLED: env.CHECKOUT_EXPIRY_ENABLED ?? env.NODE_ENV !== 'test',
    // Off until set: the shop opens ordering when ORDERING_ENABLED=true (tests run with it on).
    ORDERING_ENABLED: env.ORDERING_ENABLED ?? env.NODE_ENV === 'test',
    STUDIO_WORKER_ENABLED: env.STUDIO_WORKER_ENABLED ?? env.NODE_ENV !== 'test',
    CATALOG_WORKER_ENABLED: env.CATALOG_WORKER_ENABLED ?? env.NODE_ENV !== 'test',
    TRYON_WORKER_ENABLED: env.TRYON_WORKER_ENABLED ?? env.NODE_ENV !== 'test',
    FX_LIVE_ENABLED: env.FX_LIVE_ENABLED ?? env.NODE_ENV !== 'test',
    PREVIEW_REFRESH_ON_START: env.PREVIEW_REFRESH_ON_START ?? env.NODE_ENV !== 'test',
    // The real model as soon as a key is set; test mode otherwise.
    AI_IMAGE_PROVIDER: env.AI_IMAGE_PROVIDER ?? (env.GEMINI_API_KEY ? 'gemini' : 'test'),
  };
}
