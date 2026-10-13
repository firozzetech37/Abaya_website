/**
 * Response shapes returned by apps/api. Clients type their API calls with these.
 * Money fields end in InPaise (integers); dates are ISO-8601 strings.
 */
import type {
  AbayaStyle,
  ConsentPurpose,
  DesignStatus,
  OptionGroupCode,
  OrderStatus,
  PaymentStatus,
  ProductionStage,
  ReferenceSource,
  ReferenceStatus,
  RefundStatus,
  Role,
  SelectionType,
  ShipmentStatus,
  SizeBandCode,
  TechPackStatus,
  WorkshopStation,
} from './enums';
import type { PatternFileType, PatternPoint } from './pattern';
import type { SelfCheckLevel, SelfCheckPoint } from './stitching';
import type { PriceBreakdown } from './pricing';
import type { TechPackContent } from './schemas';

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

// ───────────── Identity ─────────────

export interface MeResponse {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  roles: Role[];
  isStaff: boolean;
  /** Purposes the user has currently granted (latest record per purpose). */
  consents: { purpose: ConsentPurpose; granted: boolean; version: string; recordedAt: string }[];
  createdAt: string;
}

export interface AddressDto {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
}

// ───────────── Customer ─────────────

export interface MeasurementProfileDto {
  id: string;
  name: string;
  heightCm: number;
  bustCm: number;
  waistCm: number;
  hipCm: number;
  shoulderCm: number;
  sleeveLengthCm: number;
  fullLengthCm: number;
  wristCm: number | null;
  notes: string | null;
  source: 'MANUAL' | 'PHOTO_SCAN';
  isDefault: boolean;
  updatedAt: string;
}

export interface WishlistItemDto {
  designId: string;
  slug: string;
  name: string;
  style: AbayaStyle;
  fromPriceInPaise: number;
  primaryImageUrl: string | null;
  /** False when the design was unpublished after it was saved. */
  available: boolean;
  addedAt: string;
}

export interface SelectedOptionDto {
  groupCode: OptionGroupCode;
  groupName: string;
  valueId: string;
  valueName: string;
  surchargeInPaise: number;
}

export interface CartItemDto {
  id: string;
  design: { id: string; slug: string; name: string; primaryImageUrl: string | null };
  selectedOptions: SelectedOptionDto[];
  selectedOptionValueIds: string[];
  size:
    | { kind: 'BAND'; sizeBandId: string; code: SizeBandCode; label: string }
    | { kind: 'MEASUREMENTS'; measurementProfileId: string; profileName: string };
  quantity: number;
  /** Fresh server quote; null when the item can no longer be ordered. */
  price: PriceBreakdown | null;
  /** Why the item cannot be ordered right now (design unpublished, option retired...). */
  problem: string | null;
}

export interface CartDto {
  items: CartItemDto[];
  subtotalInPaise: number;
  /** True when every item has a price and no problem. */
  canCheckout: boolean;
}

// ───────────── Catalog (admin) ─────────────

export interface AdminDesignImageDto {
  id: string;
  storagePath: string;
  /** Signed (draft) or public (published) URL for display in the admin panel. */
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
  /** The COLOUR option value this photo shows; null = the main photoshoot (every colour). */
  colourValueId: string | null;
  /** A close-up detail shot (fabric, embroidery, hem…). */
  isDetail: boolean;
}

export interface AdminDesignOptionDto {
  optionValueId: string;
  surchargeOverrideInPaise: number | null;
  isDefault: boolean;
}

export interface AdminDesignListItem {
  id: string;
  slug: string;
  name: string;
  style: AbayaStyle;
  status: DesignStatus;
  basePriceInPaise: number | null;
  designer: { id: string; name: string | null; email: string | null } | null;
  primaryImageUrl: string | null;
  updatedAt: string;
  /** Strongest AI look-alike found among other designs and references (null when none or AI is off). */
  aiMatch: AiMatchLevel | null;
  /** Uploaded photos, or picked from AI variations in the Studio. */
  source: 'UPLOAD' | 'AI_GENERATED';
}

export interface AdminDesignDetail extends AdminDesignListItem {
  /** The designer confirmed the design is original (when it was submitted). */
  originalityConfirmedAt: string | null;
  /** A Pinterest pin looked at for ideas (link only). */
  inspirationUrl: string | null;
  /** AI designs: the prompt and model they came from. */
  aiGeneration: { generationId: string; prompt: string; model: string; createdAt: string } | null;
  submittedAt: string | null;
  approvedAt: string | null;
  downloadEnabled: boolean;
  /** null = the default price (DEFAULT_DOWNLOAD_PRICE_IN_PAISE). */
  downloadPriceInPaise: number | null;
  description: string | null;
  tags: string[];
  makingCostInPaise: number | null;
  leadTimeDays: number;
  reviewNotes: string | null;
  referenceId: string | null;
  collectionIds: string[];
  images: AdminDesignImageDto[];
  options: AdminDesignOptionDto[];
  publishedAt: string | null;
  createdAt: string;
  /** Statuses this user may move the design to right now. */
  allowedTransitions: DesignStatus[];
}

export interface CollectionDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  designCount: number;
  /** Photo of the newest published design in the collection (web preview), for the tiles. */
  coverImageUrl: string | null;
  /** Short looping video behind the collection on the home page; null until one is uploaded. */
  videoUrl: string | null;
  /** Photos of up to three newest published designs in the collection (web previews). */
  previewImageUrls: string[];
}

/** Admin view of a collection: includes every member design, published or not. */
export interface AdminCollectionDto extends Omit<CollectionDto, 'coverImageUrl' | 'previewImageUrls'> {
  designIds: string[];
  videoPath: string | null;
}

/** What the website shows in its top bar, in the page's language. */
export interface AnnouncementDto {
  id: string;
  text: string;
  linkPath: string | null;
}

export interface TranslationDto {
  textAr: string;
  /** Which service made the draft. */
  provider: 'gemini' | 'mymemory' | 'test';
}

export interface AdminAnnouncementDto {
  id: string;
  textEn: string;
  textAr: string;
  linkPath: string | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  /** Active and within its dates right now. */
  live: boolean;
  updatedAt: string;
}

export interface ReferenceDto {
  id: string;
  source: ReferenceSource;
  sourceUrl: string | null;
  imageUrl: string;
  title: string | null;
  tags: string[];
  licenseNote: string | null;
  status: ReferenceStatus;
  reviewNotes: string | null;
  assignedDesigner: { id: string; name: string | null; email: string | null } | null;
  designIds: string[];
  importedAt: string;
  aiMatch: AiMatchLevel | null;
}

// ───────────── AI assistant (Step 15) ─────────────

/** DUPLICATE: almost certainly the same image or design. SIMILAR: close enough for a human look. */
export type AiMatchLevel = 'DUPLICATE' | 'SIMILAR';

/** OFF: no AI service configured. PENDING: images still being analysed. FAILED: every image failed. */
export type AiAnalysisStatus = 'OFF' | 'PENDING' | 'READY' | 'FAILED';

export interface AiSuggestedTag {
  tag: string;
  group: string; // vocabulary group, e.g. "colour"
  label: string; // e.g. "Olive green"
  score: number; // 0-1 model confidence
}

export interface AiSimilarItem {
  kind: 'DESIGN' | 'REFERENCE';
  id: string;
  /** Null when the viewer may not open it (e.g. another designer's design). */
  name: string | null;
  imageUrl: string | null;
  status: string | null;
  score: number; // 0-1 visual similarity
  level: AiMatchLevel;
  /** The reference this design was created from (a copy of it is exactly what reviewers look for). */
  isOwnReference: boolean;
}

export interface AiInsightsDto {
  status: AiAnalysisStatus;
  analysedImages: number;
  totalImages: number;
  /** Suggestions not yet on the design/reference; null when there is nothing left to suggest. */
  suggestion: {
    tags: AiSuggestedTag[];
    style: { value: AbayaStyle; score: number } | null;
    altText: string | null;
  } | null;
  similar: AiSimilarItem[];
  hasDuplicate: boolean;
}

export interface AiStatusDto {
  enabled: boolean;
  reachable: boolean;
  model: string | null;
  tagger: string | null;
  modelLoaded: boolean;
  queue: { queued: number; done: number; failed: number };
  thresholds: { duplicate: number; similar: number };
}

// ───────────── Pricing (admin) ─────────────

export interface AdminOptionValueDto {
  id: string;
  groupCode: OptionGroupCode;
  code: string;
  name: string;
  description: string | null;
  surchargeInPaise: number;
  colourHex: string | null;
  swatchImageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminOptionGroupDto {
  id: string;
  code: OptionGroupCode;
  name: string;
  selectionType: SelectionType;
  isRequired: boolean;
  sortOrder: number;
  values: AdminOptionValueDto[];
}

export interface AdminSizeBandDto {
  id: string;
  code: SizeBandCode;
  label: string;
  adjustmentInPaise: number;
  bustMinCm: number | null;
  bustMaxCm: number | null;
  isActive: boolean;
  sortOrder: number;
}

// ───────────── Orders ─────────────

export interface StageEventDto {
  id: string;
  fromStage: ProductionStage | null;
  toStage: ProductionStage;
  note: string | null;
  /** Signed URL, valid ~10 minutes. */
  photoUrl: string | null;
  createdAt: string;
}

export interface ShipmentDto {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: ShipmentStatus;
  orderItemIds: string[];
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface OrderItemDto {
  id: string;
  design: { id: string; name: string; slug: string; style: AbayaStyle; primaryImageUrl: string | null };
  options: SelectedOptionDto[];
  sizeBandCode: SizeBandCode;
  measurements: Record<string, number | string | null> | null;
  priceBreakdown: PriceBreakdown;
  unitPriceInPaise: number;
  quantity: number;
  stage: ProductionStage;
  /**
   * Staff only: the customer's website AI preview of this abaya (never a try-on). Approximate:
   * the options are the specification. `inspirationOnly` when it was made from her own words.
   */
  aiPreview?: { url: string; inspirationOnly: boolean } | null;
  stageEvents: StageEventDto[];
}

export interface AddressSnapshot {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalInPaise: number;
  itemCount: number;
  /** Least-advanced active stage across items, for a single status chip. */
  headlineStage: ProductionStage | null;
  primaryImageUrl: string | null;
  placedAt: string | null;
  createdAt: string;
}

export interface OrderDetailDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotalInPaise: number;
  shippingInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  shippingAddress: AddressSnapshot;
  customerNote: string | null;
  placedAt: string | null;
  createdAt: string;
  items: OrderItemDto[];
  shipments: ShipmentDto[];
}

// ───────────── Admin: orders & production ─────────────

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalInPaise: number;
  customerName: string | null;
  placedAt: string | null;
  createdAt: string;
  items: {
    id: string;
    designName: string;
    stage: ProductionStage;
    makerName: string | null;
    dueDate: string | null;
    /** Who has the job at its current station (assigned person, or who took it). */
    withName: string | null;
    /** Every station has someone assigned (tailor included). */
    teamComplete: boolean;
  }[];
}

export interface TeamMemberDto {
  id: string;
  name: string | null;
}

/** One person per station for an abaya; stitching is the tailor (Maker id and name). */
export type ItemTeamDto = Record<'pattern' | 'cutting' | 'stitching' | 'qc' | 'finishing', TeamMemberDto | null>;

/** A person who can be picked for a station, with the jobs at or still coming to them. */
export interface TeamOptionDto {
  id: string;
  name: string | null;
  activeJobs: number;
}

/** GET /v1/admin/team-options — pickers for the Assign team dialog. */
export type TeamOptionsDto = Record<'pattern' | 'cutting' | 'stitching' | 'qc' | 'finishing', TeamOptionDto[]>;

export interface TechPackDto {
  id: string;
  status: TechPackStatus;
  content: TechPackContent;
  approvedBy: { id: string; name: string | null } | null;
  approvedAt: string | null;
  updatedAt: string;
}

export interface QcCheckDto {
  id: string;
  result: 'PASS' | 'FAIL';
  checklist: { item: string; ok: boolean }[];
  notes: string | null;
  photoUrls: string[];
  checkedBy: { id: string; name: string | null } | null;
  createdAt: string;
}

export interface AdminOrderItemDto extends OrderItemDto {
  maker: { id: string; name: string; city: string } | null;
  dueDate: string | null;
  /** One person per station (docs/apps/workshop.md "Team"). */
  team: ItemTeamDto;
  techPack: TechPackDto | null;
  /** Latest pattern version (draft or confirmed). */
  pattern: PatternDto | null;
  cuttings: CuttingDto[];
  stitchings: StitchingDto[];
  qcChecks: QcCheckDto[];
  /** Stages this item may move to next (PRODUCTION_TRANSITIONS). */
  nextStages: ProductionStage[];
}

/** GET /v1/admin/order-items/:id/tech-pack: the saved pack, plus a draft built from the order snapshot. */
export interface TechPackResponse {
  saved: TechPackDto | null;
  draft: TechPackContent;
}

export interface VerifyPaymentResponse {
  orderId: string;
  status: 'CAPTURED';
}

export interface PaymentDto {
  id: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountInPaise: number;
  status: PaymentStatus;
  method: string | null;
  refundedInPaise: number;
  refunds: { id: string; amountInPaise: number; reason: string; status: RefundStatus; createdAt: string }[];
  createdAt: string;
}

export interface AdminOrderDetail extends Omit<OrderDetailDto, 'items' | 'shippingAddress'> {
  /** Null unless the viewer's role may see customer contact details. */
  customer: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  shippingAddress: AddressSnapshot | null;
  items: AdminOrderItemDto[];
  payments: PaymentDto[];
}

export interface MakerDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string;
  skills: string[];
  capacityPerWeek: number;
  rating: number;
  isActive: boolean;
  activeItemCount: number;
  pendingPayoutInPaise: number;
  /** True once the tailor has signed in to the workshop (their login is linked). */
  hasLogin: boolean;
}

export interface MakerPayoutDto {
  id: string;
  makerId: string;
  orderItemId: string | null;
  amountInPaise: number;
  status: 'PENDING' | 'PAID';
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
}

// ───────────── Admin: platform ─────────────

/** GET /v1/admin/staff?role=… — names for pickers. */
export interface StaffDirectoryEntry {
  id: string;
  name: string | null;
  email: string | null;
}

export interface AdminUserDto {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  roles: Role[];
  isActive: boolean;
  createdAt: string;
}

/** Admin Customers list. Contact fields are null for roles that may not see them. */
/** GET /v1/admin/customers/analytics — totals for the Customers page. */
export interface CustomerAnalyticsDto {
  accounts: number;
  newThisMonth: number;
  /** Accounts with at least one order past checkout. */
  buyers: number;
  /** Buyers with two or more orders. */
  repeatBuyers: number;
  /** Paid and completed orders. */
  paidOrders: number;
  revenueInPaise: number;
  averageOrderValueInPaise: number;
  topCustomers: { id: string; name: string | null; email: string | null; orderCount: number; totalSpentInPaise: number }[];
}

export interface AdminCustomerDto {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  /** Also holds a staff role (staff can shop too). */
  isStaff: boolean;
  createdAt: string;
  /** Orders past checkout (any status except PENDING_PAYMENT). */
  orderCount: number;
  /** Sum of PAID and COMPLETED order totals. */
  totalSpentInPaise: number;
  lastOrderAt: string | null;
}

export type StaffInviteStatus = 'PENDING' | 'ACCEPTED' | 'CANCELLED';

export interface StaffInviteDto {
  id: string;
  email: string;
  name: string | null;
  roles: Role[];
  status: StaffInviteStatus;
  invitedBy: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  acceptedAt: string | null;
}

/** POST /v1/admin/staff-invites: an invite, or the roles applied straight away to an existing account. */
export interface StaffInviteResult {
  invite: StaffInviteDto | null;
  user: AdminUserDto | null;
}

// ───────────── Workshop ─────────────

export interface WorkshopStationSummary {
  station: WorkshopStation;
  waiting: number;
  mine: number;
  overdue: number;
  onHold: number;
}

export interface WorkshopQueueItem {
  id: string;
  orderNumber: string;
  designName: string;
  style: AbayaStyle;
  primaryImageUrl: string | null;
  sizeBandCode: SizeBandCode;
  stage: ProductionStage;
  /** ON_HOLD items: the stage they will return to, and why they are held. */
  heldFromStage: ProductionStage | null;
  holdReason: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  claimedBy: { id: string; name: string | null } | null;
  /** When the job was taken (for stitching: when it was started). */
  claimedAt: string | null;
  makerName: string | null;
  /** The person assigned to the job's current station (null: open to anyone at the station). */
  assignedTo: TeamMemberDto | null;
  /** What the job needs, at a glance on the queue card. */
  brief: WorkshopBriefDto;
  /** Came back from QC or is a remake. */
  isRework: boolean;
  /** When it arrived at its current stage. */
  stageSince: string;
}

export type WorkshopActionKind = 'claim' | 'release' | 'advance' | 'hold' | 'resume' | 'qc' | 'ship' | 'deliver';

/** A button the caller may press on this item right now (the API re-checks every one). */
export interface WorkshopAction {
  kind: WorkshopActionKind;
  to: ProductionStage | null;
  photoRequired: boolean;
}

export interface WorkshopItemDetail extends WorkshopQueueItem {
  orderId: string;
  station: WorkshopStation | null;
  options: { groupName: string; valueName: string }[];
  /** Numbers the garment is made from (cm); customer names and notes are never included. */
  measurements: Record<string, number> | null;
  techPack: TechPackContent | null;
  referenceImageUrls: string[];
  /** The customer's website AI preview of this abaya (never a try-on); approximate, the options are the specification. */
  aiPreview: { url: string; inspirationOnly: boolean } | null;
  qcChecks: {
    result: 'PASS' | 'FAIL';
    checklist: { item: string; ok: boolean }[];
    notes: string | null;
    photoUrls: string[];
    createdAt: string;
  }[];
  events: {
    fromStage: ProductionStage | null;
    toStage: ProductionStage;
    note: string | null;
    photoUrl: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
  /** The confirmed pattern the later stations work from (null until pattern is confirmed). */
  pattern: PatternDto | null;
  /** Cutting records, newest first (lot, metres, pieces, photo). */
  cuttings: CuttingDto[];
  /** Stitching records, newest first (checklist, self-check, time, photo). */
  stitchings: StitchingDto[];
  /** Who does each station for this abaya (names only). */
  team: ItemTeamDto;
  /** Stitching station, own job: what the tailor is paid for this piece (making charge). */
  makingChargeInPaise: number | null;
  /** Logistics and production managers only; null for every other station. */
  customer: { name: string | null; phone: string | null } | null;
  shippingAddress: AddressSnapshot | null;
  actions: WorkshopAction[];
}

export interface PatternMeasurementDto {
  key: PatternPoint;
  bodyCm: number | null;
  easeCm: number;
  /** body + ease; null while the body measurement is missing. */
  finishedCm: number | null;
}

/** One version of an item's pattern (docs/apps/workshop.md, Pattern station). */
export interface PatternDto {
  id: string;
  version: number;
  status: 'DRAFT' | 'CONFIRMED';
  measurements: PatternMeasurementDto[];
  pieces: { name: string; count: number }[];
  fabricWidthCm: number | null;
  fabricLengthCm: number | null;
  liningLengthCm: number | null;
  seamAllowanceMm: number;
  notes: string;
  files: { path: string; name: string; contentType: PatternFileType; url: string }[];
  createdBy: { id: string; name: string | null } | null;
  confirmedBy: { id: string; name: string | null } | null;
  confirmedAt: string | null;
  updatedAt: string;
}

/** GET /v1/workshop/items/:id/pattern: the pattern to edit (or read) plus a starting point. */
export interface PatternStationDto {
  /** Latest version, draft or confirmed; null before the first save. */
  current: PatternDto | null;
  /** Earlier versions, newest first (a QC fail back to pattern starts a new version). */
  previous: PatternDto[];
  /** The caller may save and confirm now. */
  editable: boolean;
  /** Prefill for a new version: body measurements from the tech pack, default ease and pieces. */
  suggestion: {
    measurements: PatternMeasurementDto[];
    pieces: { name: string; count: number }[];
    style: AbayaStyle;
  };
  /** What is still missing before it can go to cutting (empty: ready). */
  missing: ('measurements' | 'pieces' | 'fabric' | 'files')[];
}

/** One cut of an item (a QC send-back to cutting adds attempt 2, 3…). */
export interface CuttingDto {
  attempt: number;
  fabricLot: string;
  colourConfirmed: boolean;
  fabricUsedCm: number;
  /** The pattern's estimate when it was cut, and the difference in percent. */
  estimateCm: number | null;
  variancePercent: number | null;
  wastageCm: number | null;
  liningUsedCm: number | null;
  pieces: { name: string; count: number; cut: boolean }[];
  notes: string;
  photoUrl: string | null;
  cutBy: { id: string; name: string | null } | null;
  createdAt: string;
}

/** One stitching of an item (a QC send-back adds attempt 2, 3…). */
export interface StitchingDto {
  attempt: number;
  checklist: { key: string; label: string; done: boolean }[];
  measurements: { key: SelfCheckPoint; measuredCm: number; targetCm: number | null; diffCm: number | null; level: SelfCheckLevel | null }[];
  notes: string;
  photoUrl: string | null;
  startedAt: string | null;
  finishedAt: string;
  /** Hours from start to "send to QC" (null when it was never started). */
  hours: number | null;
  stitchedBy: { id: string; name: string | null } | null;
  makerName: string | null;
}

/** A tailor's money: what this job pays, what is waiting and what was paid. */
export interface TailorEarningsDto {
  pendingInPaise: number;
  paidThisMonthInPaise: number;
  paidTotalInPaise: number;
  recent: { orderNumber: string | null; designName: string | null; amountInPaise: number; status: 'PENDING' | 'PAID'; paidAt: string | null; createdAt: string }[];
}

/** Key facts of a job for the queue card (no customer data). */
export interface WorkshopBriefDto {
  /** Made-to-measure: the main body measurements (cm); empty for standard sizes. */
  measurements: { key: string; cm: number }[];
  /** Chosen options, e.g. Sleeve: Bell. */
  options: { group: string; value: string }[];
  /** Pattern station: the latest pattern and what it still needs before cutting. */
  pattern: { version: number; status: 'DRAFT' | 'CONFIRMED'; missing: ('measurements' | 'pieces' | 'fabric' | 'files')[] } | null;
}

/** A job finished at a station (the station's "Done" tab). */
export interface WorkshopDoneItemDto {
  id: string;
  orderNumber: string;
  designName: string;
  style: AbayaStyle;
  primaryImageUrl: string | null;
  sizeBandCode: SizeBandCode;
  /** Where the job is now. */
  stage: ProductionStage;
  /** The step that finished it here (e.g. PATTERN → CUTTING), when and by whom. */
  toStage: ProductionStage;
  doneAt: string;
  doneBy: { id: string; name: string | null } | null;
  note: string | null;
  /** Managers may still open it. */
  canOpen: boolean;
}

/** One active job in the manager's overview of the workshop. */
export interface OverviewJobDto {
  id: string;
  orderId: string;
  orderNumber: string;
  designName: string;
  primaryImageUrl: string | null;
  stage: ProductionStage;
  station: WorkshopStation | null;
  heldFromStage: ProductionStage | null;
  holdReason: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  isRework: boolean;
  /** Who started it at its current station, and when. */
  startedBy: { id: string; name: string | null } | null;
  startedAt: string | null;
}

/**
 * For one person: `started` (working on it now), `waiting` (at their station, not started),
 * `held` (on hold at their station), `upcoming` (still at an earlier station).
 */
export type OverviewJobState = 'started' | 'waiting' | 'held' | 'upcoming';

export interface OverviewPersonDto {
  /** User id, or the Maker id for a tailor. */
  id: string;
  kind: 'staff' | 'tailor';
  name: string | null;
  station: 'pattern' | 'cutting' | 'stitching' | 'qc' | 'finishing';
  jobs: (OverviewJobDto & { state: OverviewJobState })[];
}

/** GET /v1/workshop/overview (managers): who is working on what, and what needs attention. */
export interface WorkshopOverviewDto {
  people: OverviewPersonDto[];
  /** On a team station with nothing started, waiting or coming to them. */
  idle: { id: string; kind: 'staff' | 'tailor'; name: string | null; station: OverviewPersonDto['station'] }[];
  onHold: OverviewJobDto[];
  overdue: OverviewJobDto[];
  /** Paid, still in production, but someone is missing from the team. */
  teamMissing: (OverviewJobDto & { missing: ('pattern' | 'cutting' | 'stitching' | 'qc' | 'finishing')[] })[];
  /** Jobs someone has started right now. */
  inProgress: number;
}

/** After a station's step: the item, or null when it has moved on to another station. */
export interface WorkshopStepResult {
  item: WorkshopItemDetail | null;
}

export interface AuditLogDto {
  id: string;
  actor: { id: string; name: string | null; email: string | null } | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface DashboardDto {
  itemsByStage: Partial<Record<ProductionStage, number>>;
  itemsDueSoon: number; // due within 3 days, not yet shipped
  lateItems: number; // past due date, not yet shipped
  revenueTodayInPaise: number; // captured payments since midnight IST
  ordersToday: number;
  designsAwaitingReview: number;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  storagePath: string;
  expiresInSeconds: number;
}

/** GET /v1/ordering/status (public): whether the bag, checkout and HD downloads are open. */
export interface OrderingStatusDto {
  orderingEnabled: boolean;
}

/** GET|POST /v1/me/ordering-waitlist: whether she asked to be told when ordering opens. */
export interface OrderingWaitlistDto {
  joined: boolean;
  joinedAt: string | null;
}

/** GET /v1/admin/ordering-waitlist */
export interface AdminWaitlistEntryDto {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  joinedAt: string;
}
export interface AdminWaitlistDto {
  total: number;
  items: AdminWaitlistEntryDto[];
  nextCursor: string | null;
}
