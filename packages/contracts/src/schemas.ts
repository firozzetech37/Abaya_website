/**
 * Zod schemas shared by clients (form validation) and the API (request
 * validation). Keep request/response shapes here, not in individual apps.
 */
import { z } from 'zod';
import {
  ABAYA_STYLES,
  CLIENT_APPS,
  CONSENT_PURPOSES,
  DEVICE_PLATFORMS,
  DESIGN_STATUSES,
  OPTION_GROUP_CODES,
  ORDER_STATUSES,
  PRODUCTION_STAGES,
  REFERENCE_STATUSES,
  ROLES,
  SIZE_BAND_CODES,
} from './enums';
import { PATTERN_FILE_TYPES } from './pattern';
import { STITCHING_PROBLEM_TYPES } from './stitching';
import { QC_SEND_BACK_STAGES } from './state-machines';

// ───────────── Primitives ─────────────

export const uuid = z.string().uuid();
/** Amounts carry no business cap; the only bound is the database's 32-bit integer column (₹2,14,74,836.47). */
export const MAX_PAISE = 2_147_483_647;
export const paise = z.number().int().min(0).max(MAX_PAISE);
export const slug = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes only');
export const indianPhone = z
  .string()
  .regex(/^(\+91)?[6-9]\d{9}$/, 'enter a valid Indian mobile number');
export const pincode = z.string().regex(/^[1-9]\d{5}$/, 'enter a valid 6-digit pincode');

// ───────────── Pagination & errors ─────────────

export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const apiError = z.object({
  error: z.object({
    code: z.string(), // e.g. "VALIDATION_FAILED", "DESIGN_NOT_PUBLISHED"
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiError>;

// ───────────── Identity ─────────────

export const updateProfileBody = z.object({
  name: z.string().min(1).max(80).optional(),
  phone: indianPhone.optional(),
});

export const addressBody = z.object({
  fullName: z.string().min(2).max(80),
  phone: indianPhone,
  line1: z.string().min(3).max(120),
  line2: z.string().max(120).optional(),
  landmark: z.string().max(80).optional(),
  city: z.string().min(2).max(60),
  state: z.string().min(2).max(60),
  pincode,
  isDefault: z.boolean().default(false),
});
export type AddressBody = z.infer<typeof addressBody>;

export const updateRolesBody = z.object({ roles: z.array(z.enum(ROLES)).min(1) });

// ───────────── Measurements ─────────────

const cm = (min: number, max: number) =>
  z.coerce
    .number()
    .min(min, `must be at least ${min} cm`)
    .max(max, `must be at most ${max} cm`)
    .multipleOf(0.1);

export const measurementBody = z.object({
  name: z.string().min(1).max(40).default('Me'),
  heightCm: cm(120, 210),
  bustCm: cm(60, 170),
  waistCm: cm(50, 160),
  hipCm: cm(60, 180),
  shoulderCm: cm(28, 60),
  sleeveLengthCm: cm(40, 85),
  fullLengthCm: cm(100, 175), // shoulder to floor
  wristCm: cm(12, 30).optional(),
  notes: z.string().max(300).optional(),
  isDefault: z.boolean().default(false),
});
export type MeasurementBody = z.infer<typeof measurementBody>;

// ───────────── Catalog (public) ─────────────

export const listDesignsQuery = paginationQuery.extend({
  style: z.enum(ABAYA_STYLES).optional(),
  collection: z.string().optional(),
  q: z.string().max(80).optional(),
  /** A colour's code (an active COLOUR option value): designs that can be made in it. */
  colour: z.string().max(60).optional(),
  minPriceInPaise: z.coerce.number().int().min(0).optional(),
  maxPriceInPaise: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
});
export type ListDesignsQuery = z.infer<typeof listDesignsQuery>;

/** The storefront's filter counts: the same filters as the list (paging and sort ignored). */
export const designFacetsQuery = listDesignsQuery.omit({ cursor: true, limit: true, sort: true });
export type DesignFacetsQuery = z.infer<typeof designFacetsQuery>;

export const designFacets = z.object({
  /** Designs matching every filter. */
  total: z.number().int(),
  /** Per style, matching every filter except the style: how many, and the newest one's photo. */
  styles: z.array(z.object({ style: z.enum(ABAYA_STYLES), count: z.number().int(), imageUrl: z.string().url().nullable() })),
  /** Per colour, matching every filter except the colour (colours with no design are left out). */
  colours: z.array(z.object({ code: z.string(), name: z.string(), hex: z.string(), count: z.number().int() })),
});
export type DesignFacets = z.infer<typeof designFacets>;

/** A design published within this many days is a "new arrival" on the storefront. */
export const NEW_ARRIVAL_DAYS = 30;

export const designCard = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  style: z.enum(ABAYA_STYLES),
  /** The active collection the design belongs to (first by sort order), for the card's eyebrow; null when none. */
  collectionName: z.string().nullable(),
  /** Published within the last NEW_ARRIVAL_DAYS days. */
  isNew: z.boolean(),
  fromPriceInPaise: paise, // base + default options
  primaryImageUrl: z.string().url().nullable(),
  /** Pixel width of the primary photo's web preview (null when unknown): the hero skips small ones. */
  primaryImageWidth: z.number().int().nullable(),
  /** A second photo (another angle) shown when the card is hovered. */
  /** A landscape photo of the design (wider than tall), for wide frames such as the home hero; null when there is none. */
  wideImageUrl: z.string().url().nullable(),
  hoverImageUrl: z.string().url().nullable(),
  /** Hex colours customers may choose for this design (up to 6), for the card's colour dots. */
  colours: z.array(z.string()),
  /** Close-up detail shots (fabric, embroidery, hem…) tagged in the admin, for the craftsmanship gallery. */
  detailImageUrls: z.array(z.string().url()),
  leadTimeDays: z.number().int(),
});
export type DesignCard = z.infer<typeof designCard>;

export const optionValueDto = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  surchargeInPaise: paise, // already includes any design override
  colourHex: z.string().nullable(),
  swatchImageUrl: z.string().url().nullable(),
  isDefault: z.boolean(),
});

export const optionGroupDto = z.object({
  code: z.enum(OPTION_GROUP_CODES),
  name: z.string(),
  selectionType: z.enum(['SINGLE', 'MULTI']),
  isRequired: z.boolean(),
  values: z.array(optionValueDto),
});

export const sizeBandDto = z.object({
  id: uuid,
  code: z.enum(SIZE_BAND_CODES),
  label: z.string(),
  adjustmentInPaise: paise,
  /** Bust range the band fits, in cm; null for CUSTOM (made to measure). */
  bustMinCm: z.number().nullable(),
  bustMaxCm: z.number().nullable(),
});

export const designDetail = designCard.extend({
  description: z.string().nullable(),
  tags: z.array(z.string()),
  basePriceInPaise: paise,
  leadTimeDays: z.number().int(),
  /** Photos in display order. `colourId` is the COLOUR option value a photo shows; null = shown for every colour. */
  images: z.array(z.object({ url: z.string().url(), alt: z.string().nullable(), colourId: uuid.nullable() })),
  optionGroups: z.array(optionGroupDto),
  sizeBands: z.array(sizeBandDto),
  /** HD download offer (full-quality images to buy); null when not sold as a download. */
  download: z.object({ priceInPaise: paise, imageCount: z.number().int() }).nullable(),
});
export type DownloadOffer = NonNullable<z.infer<typeof designDetail>['download']>;
export type DesignDetail = z.infer<typeof designDetail>;

// ───────────── Pricing ─────────────

export const quoteBody = z
  .object({
    designId: uuid,
    selectedOptionValueIds: z.array(uuid).max(20),
    sizeBandId: uuid.optional(),
    measurementProfileId: uuid.optional(),
    quantity: z.number().int().min(1).max(10).default(1),
  })
  .refine((b) => Boolean(b.sizeBandId) !== Boolean(b.measurementProfileId), {
    message: 'choose either a size or a measurement profile',
  });
export type QuoteBody = z.infer<typeof quoteBody>;

// ───────────── Cart & checkout ─────────────

export const addCartItemBody = quoteBody;
export const updateCartItemBody = z.object({ quantity: z.number().int().min(1).max(10) });

export const checkoutBody = z.object({
  addressId: uuid,
  customerNote: z.string().max(300).optional(),
});

export const checkoutResponse = z.object({
  orderId: uuid,
  orderNumber: z.string(),
  totalInPaise: paise,
  razorpay: z.object({ keyId: z.string(), orderId: z.string(), amount: paise, currency: z.literal('INR') }),
  /** 'test' = development fake payments (PAYMENT_PROVIDER=fake): show "Simulate payment" instead of Razorpay. */
  paymentMode: z.enum(['razorpay', 'test']),
});

export type CheckoutResponse = z.infer<typeof checkoutResponse>;

export const verifyPaymentBody = z.object({
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

// ───────────── Admin: catalog ─────────────

export const createDesignBody = z.object({
  name: z.string().min(3).max(100),
  slug: slug.optional(), // generated from name when omitted
  description: z.string().max(2000).optional(),
  style: z.enum(ABAYA_STYLES),
  tags: z.array(z.string().min(1).max(30)).max(15).default([]),
  referenceId: uuid.optional(),
  leadTimeDays: z.number().int().min(3).max(60).default(12),
  /** A Pinterest pin looked at for ideas (link only, never the image). */
  inspirationUrl: z.string().url().max(500).optional(),
});
export const updateDesignBody = createDesignBody.partial().extend({
  basePriceInPaise: paise.optional(),
  makingCostInPaise: paise.optional(),
  /** HD download (catalog manager): sell the design's images; price null = the default. */
  downloadEnabled: z.boolean().optional(),
  downloadPriceInPaise: paise.min(100).max(1_000_000).nullable().optional(),
  collectionIds: z.array(uuid).optional(),
});

export const setDesignOptionsBody = z.object({
  options: z
    .array(
      z.object({
        optionValueId: uuid,
        surchargeOverrideInPaise: paise.nullable().optional(),
        isDefault: z.boolean().default(false),
      }),
    )
    .min(1),
});

export const designTransitionBody = z.object({
  to: z.enum(DESIGN_STATUSES),
  /** Submitting for review: the designer confirms the design is original (required). */
  originalityConfirmed: z.boolean().optional(),
  notes: z.string().max(1000).optional(), // required by the API for CHANGES_REQUESTED
  /** Approving (IN_REVIEW → PRICED) a design the AI flags as a likely duplicate needs this tick. */
  duplicatesChecked: z.boolean().optional(),
});

/** Accept some or all of the AI's suggestions for a design or reference (Step 15). */
export const applyAiSuggestionBody = z.object({
  tags: z.array(z.string().min(1).max(30)).max(15).default([]),
  style: z.enum(ABAYA_STYLES).optional(), // designs only
  /** Alt text for images that have none (designs only). */
  altText: z.string().min(1).max(200).optional(),
});
export type ApplyAiSuggestionBody = z.infer<typeof applyAiSuggestionBody>;

export const createUploadUrlBody = z.object({
  fileName: z.string().min(1).max(120),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  purpose: z.enum(['DESIGN_IMAGE', 'DESIGN_SKETCH', 'CATALOG_INPUT', 'STAGE_PHOTO', 'QC_PHOTO', 'REFERENCE_IMAGE', 'COLLECTION_VIDEO', 'IMAGE_CHECK']),
});
export const createUploadUrlResponse = z.object({
  uploadUrl: z.string().url(),
  storagePath: z.string(),
  expiresInSeconds: z.number().int(),
});

export const upsertOptionValueBody = z.object({
  groupCode: z.enum(OPTION_GROUP_CODES),
  code: slug,
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  surchargeInPaise: paise,
  colourHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  isActive: z.boolean().default(true),
});

// ───────────── Admin: production ─────────────

export const stageChangeBody = z.object({
  to: z.enum(PRODUCTION_STAGES),
  note: z.string().max(500).optional(),
  photoPath: z.string().optional(),
});

export const assignMakerBody = z.object({
  makerId: uuid,
  dueDate: z.coerce.date(),
});

export const qcCheckBody = z.object({
  result: z.enum(['PASS', 'FAIL']),
  checklist: z.array(z.object({ item: z.string(), ok: z.boolean() })).min(1),
  notes: z.string().max(1000).optional(),
  photoPaths: z.array(z.string()).max(10).default([]),
  /** FAIL only: the station that must fix it (default STITCHING). */
  sendBackTo: z.enum(QC_SEND_BACK_STAGES).optional(),
});

export const refundBody = z.object({
  amountInPaise: paise.refine((v) => v > 0, 'amount must be more than 0'),
  reason: z.string().min(3).max(300),
});

// ───────────── Identity: consent & privacy ─────────────

export const recordConsentsBody = z.object({
  version: z.string().min(1).max(20), // POLICY_VERSION the user saw
  consents: z
    .array(z.object({ purpose: z.enum(CONSENT_PURPOSES), granted: z.boolean() }))
    .min(1),
});
export type RecordConsentsBody = z.infer<typeof recordConsentsBody>;

/** POST /v1/me/devices — Expo push token for this install (customer app). */
export const registerDeviceBody = z.object({
  token: z.string().regex(/^(Exponent|Expo)PushToken\[[^\]]+\]$/, 'not an Expo push token'),
  platform: z.enum(DEVICE_PLATFORMS),
  app: z.enum(CLIENT_APPS),
});
export type RegisterDeviceBody = z.infer<typeof registerDeviceBody>;

export const deleteAccountBody = z.object({
  confirm: z.literal('DELETE'),
});

// ───────────── Admin: catalog (more) ─────────────

export const listAdminDesignsQuery = paginationQuery.extend({
  status: z.enum(DESIGN_STATUSES).optional(),
  q: z.string().max(80).optional(),
  mine: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListAdminDesignsQuery = z.infer<typeof listAdminDesignsQuery>;

export const attachDesignImageBody = z.object({
  storagePath: z.string().min(1).max(300),
  alt: z.string().max(200).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isPrimary: z.boolean().default(false),
  /** The COLOUR option value this photo shows; omit/null for the main photoshoot (every colour). */
  colourValueId: uuid.nullable().optional(),
  /** A close-up detail shot (fabric, embroidery, hem…) for the craftsmanship gallery. */
  isDetail: z.boolean().optional(),
});

export const updateDesignImagesBody = z.object({
  /** Image ids in display order; the first flagged primary (or the first) becomes primary. */
  images: z
    .array(
      z.object({
        id: uuid,
        alt: z.string().max(200).nullable().optional(),
        isPrimary: z.boolean().default(false),
        /** Left out = unchanged; null = the main photoshoot (every colour). */
        colourValueId: uuid.nullable().optional(),
        /** Left out = unchanged. */
        isDetail: z.boolean().optional(),
      }),
    )
    .max(20),
});

export const updateOptionValueBody = upsertOptionValueBody.omit({ groupCode: true, code: true }).partial();

export const updateSizeBandBody = z.object({
  label: z.string().min(1).max(80).optional(),
  adjustmentInPaise: paise.optional(),
  isActive: z.boolean().optional(),
});

export const collectionBody = z.object({
  slug,
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  designIds: z.array(uuid).max(200).optional(),
  /** A looping video uploaded with purpose COLLECTION_VIDEO; null removes it. */
  videoPath: z.string().min(1).max(300).nullable().optional(),
});
export const updateCollectionBody = collectionBody.partial();

/** A website top-bar announcement (admin). Dates are ISO strings; null clears them. */
export const announcementBody = z
  .object({
    textEn: z.string().trim().min(2).max(140),
    textAr: z.string().trim().min(2).max(140),
    linkPath: z.string().trim().max(300).nullable().optional(),
    isActive: z.boolean().default(true),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .refine((b) => !b.startsAt || !b.endsAt || b.startsAt < b.endsAt, { message: 'The end must be after the start.', path: ['endsAt'] });
/** POST /v1/admin/announcements/translate: an Arabic draft of an English message (to be checked by a person). */
export const translateBody = z.object({ text: z.string().trim().min(2).max(140) });

export const updateAnnouncementBody = z.object({
  textEn: z.string().trim().min(2).max(140).optional(),
  textAr: z.string().trim().min(2).max(140).optional(),
  linkPath: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const createReferenceBody = z.object({
  imagePath: z.string().min(1).max(300), // private bucket path from POST /v1/admin/uploads
  title: z.string().max(120).optional(),
  sourceUrl: z.string().url().optional(),
  licenseNote: z.string().max(300).optional(),
  tags: z.array(z.string().min(1).max(30)).max(15).default([]),
});

export const updateReferenceBody = z.object({
  title: z.string().max(120).optional(),
  tags: z.array(z.string().min(1).max(30)).max(15).optional(),
  licenseNote: z.string().max(300).optional(),
  status: z.enum(REFERENCE_STATUSES).optional(),
  reviewNotes: z.string().max(1000).optional(),
  assignedDesignerId: uuid.nullable().optional(),
});

export const listReferencesQuery = paginationQuery.extend({
  status: z.enum(REFERENCE_STATUSES).optional(),
});

// ───────────── Admin: orders & production (more) ─────────────

export const listAdminOrdersQuery = paginationQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  stage: z.enum(PRODUCTION_STAGES).optional(),
  q: z.string().max(80).optional(), // order number or customer email/phone
  customerId: z.string().uuid().optional(), // one customer's orders (admin Customers screen)
});
export type ListAdminOrdersQuery = z.infer<typeof listAdminOrdersQuery>;

/** Customers = accounts without any staff role; staff = anyone with one; all = both. */
export const CUSTOMER_AUDIENCES = ['customers', 'staff', 'all'] as const;
export type CustomerAudience = (typeof CUSTOMER_AUDIENCES)[number];

export const listAdminCustomersQuery = paginationQuery.extend({
  q: z.string().trim().max(80).optional(), // name, email or phone
  audience: z.enum(CUSTOMER_AUDIENCES).default('customers'),
});

export const customerAnalyticsQuery = z.object({ audience: z.enum(CUSTOMER_AUDIENCES).default('customers') });
export type ListAdminCustomersQuery = z.infer<typeof listAdminCustomersQuery>;

export const techPackContent = z.object({
  style: z.string().max(80),
  fabric: z.string().max(80),
  colour: z.string().max(80),
  /** Embroidery / pattern colour; empty when the design offers no choice. */
  patternColour: z.string().max(80).default(''),
  sleeve: z.string().max(200),
  closure: z.string().max(200),
  embellishments: z.string().max(500).default(''),
  addOns: z.string().max(300).default(''),
  /** Measurement name → centimetres (customer snapshot or size-band chart). */
  measurements: z.record(z.string(), z.number().min(0).max(300)),
  constructionNotes: z.string().max(3000).default(''),
  referenceImagePaths: z.array(z.string()).max(10).default([]),
});
export type TechPackContent = z.infer<typeof techPackContent>;

export const saveTechPackBody = z.object({
  content: techPackContent,
  approve: z.boolean().default(false), // true → APPROVED and item moves to SPEC_APPROVED
});

export const shipItemsBody = z.object({
  orderItemIds: z.array(uuid).min(1),
  carrier: z.string().min(2).max(60),
  trackingNumber: z.string().min(3).max(60),
  trackingUrl: z.string().url().optional(),
});

export const cancelItemBody = z.object({
  reason: z.string().min(3).max(300),
  refund: z.boolean().default(true),
});

export const makerBody = z.object({
  name: z.string().min(2).max(80),
  /** Optional: tailors sign in with their email. */
  phone: indianPhone.nullable().optional(),
  city: z.string().min(2).max(60),
  /** The tailor's staff login (set when they are added in Staff & roles); linked on first sign-in. */
  email: z.string().email().max(120).transform((e) => e.toLowerCase()).optional(),
  skills: z.array(z.string().min(1).max(40)).max(30).default([]),
  capacityPerWeek: z.number().int().min(1).max(200).default(10),
  isActive: z.boolean().default(true),
});
/** Tailors are added in Staff & roles; here only their details change (not the login email). */
export const updateMakerBody = makerBody.omit({ email: true }).partial();

export const markPayoutPaidBody = z.object({ reference: z.string().min(3).max(100) });

// ───────────── Admin: platform ─────────────

export const listUsersQuery = paginationQuery.extend({
  q: z.string().max(80).optional(),
  role: z.enum(ROLES).optional(),
});

export const listAuditLogsQuery = paginationQuery.extend({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(60).optional(),
  actorUserId: uuid.optional(),
  action: z.string().max(60).optional(),
});

// ───────────── Staff invites (Step W1) ─────────────

/** SUPER_ADMIN adds a staff member by email; roles apply on their first sign-in (or at once if they have an account). */
export const staffInviteBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    name: z.string().trim().min(1).max(100).optional(),
    roles: z
      .array(z.enum(ROLES))
      .min(1)
      .max(ROLES.length)
      .refine((r) => !r.includes('CUSTOMER'), 'Customer is not a staff role'),
    /** Tailor (MAKER) only: their city, for the tailor record used to assign jobs and payouts. */
    tailor: z.object({ city: z.string().trim().min(2).max(60) }).optional(),
  })
  .refine((b) => !b.roles.includes('MAKER') || b.tailor !== undefined, {
    message: 'A tailor needs a city',
    path: ['tailor'],
  });
export type StaffInviteBody = z.infer<typeof staffInviteBody>;

// ───────────── Workshop (/workshop in the admin website) ─────────────

export const workshopQueueQuery = z.object({
  view: z.enum(['all', 'mine', 'overdue', 'on-hold']).default('all'),
});

/** Move an item forward at the caller's station (e.g. pattern confirmed → CUTTING). */
export const workshopAdvanceBody = z.object({
  to: z.enum(PRODUCTION_STAGES),
  note: z.string().max(500).optional(),
  /** Required when the step needs a photo (cut pieces, finished piece, packed parcel). */
  photoPath: z.string().max(300).optional(),
});

export const workshopHoldBody = z.object({
  reason: z.string().trim().min(3, 'Say what is unclear').max(500),
  /** Stitching: what is wrong with the cut kit, and a photo of it. */
  problemType: z.enum(STITCHING_PROBLEM_TYPES).optional(),
  photoPath: z.string().max(300).optional(),
});

/** Resume a held job; a production manager may send a stitching problem back to cutting instead. */
export const workshopResumeBody = z.object({
  note: z.string().max(500).optional(),
  to: z.enum(PRODUCTION_STAGES).optional(),
});

/** Station photos are images; pattern files may also be PDF or DXF (CAD). */
export const workshopUploadBody = z
  .object({
    contentType: z.enum(PATTERN_FILE_TYPES),
    purpose: z.enum(['STAGE_PHOTO', 'QC_PHOTO', 'PATTERN_FILE']).default('STAGE_PHOTO'),
  })
  .refine((b) => b.purpose === 'PATTERN_FILE' || b.contentType.startsWith('image/'), {
    message: 'Photos must be JPEG, PNG or WebP images',
    path: ['contentType'],
  });
