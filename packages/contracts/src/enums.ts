/**
 * Enum values shared by every app. They MUST match the enums in
 * packages/db/prisma/schema.prisma. Clients import these instead of Prisma.
 */

export const ROLES = [
  'SUPER_ADMIN',
  'CATALOG_MANAGER',
  'PRODUCTION_MANAGER',
  'DESIGNER',
  'QC',
  'SUPPORT',
  'MAKER',
  'CUSTOMER',
  // Workshop stations (in-house staff, docs/apps/workshop.md)
  'PATTERN_TECHNICIAN',
  'CUTTER',
  'FINISHER',
  'LOGISTICS',
] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'CATALOG_MANAGER',
  'PRODUCTION_MANAGER',
  'DESIGNER',
  'QC',
  'SUPPORT',
  'PATTERN_TECHNICIAN',
  'CUTTER',
  'MAKER', // tailor: stitching station, own jobs only
  'FINISHER',
  'LOGISTICS',
];

/**
 * Roles that may read admin-panel data (designs, orders list, dashboard, audit). Workshop
 * station roles use the /v1/workshop endpoints instead, which never expose customers.
 */
export const ADMIN_PANEL_ROLES: readonly Role[] = ['SUPER_ADMIN', 'CATALOG_MANAGER', 'PRODUCTION_MANAGER', 'DESIGNER', 'QC', 'SUPPORT'];

/** Staff who work in the admin panel itself; everyone else with a station goes to /workshop. */
export const OFFICE_ROLES: readonly Role[] = ['SUPER_ADMIN', 'CATALOG_MANAGER', 'PRODUCTION_MANAGER', 'DESIGNER', 'SUPPORT'];

export const REFERENCE_STATUSES = [
  'IMPORTED',
  'IN_REVIEW',
  'NEEDS_DESIGN',
  'DESIGNED',
  'REJECTED',
] as const;
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];

export const DESIGN_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'PRICED',
  'PUBLISHED',
  'ARCHIVED',
] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export const ABAYA_STYLES = [
  'CLOSED',
  'OPEN_FRONT',
  'BUTTERFLY',
  'KIMONO',
  'BISHT',
  'KAFTAN',
  'OTHER',
] as const;
export type AbayaStyle = (typeof ABAYA_STYLES)[number];

export const OPTION_GROUP_CODES = [
  'FABRIC',
  'COLOUR',
  'PATTERN_COLOUR',
  'SLEEVE',
  'EMBELLISHMENT',
  'CLOSURE',
  'ADD_ON',
] as const;
export type OptionGroupCode = (typeof OPTION_GROUP_CODES)[number];
/** Groups whose values are colours, shown as round swatches (`colourHex`): the fabric colour and the embroidery colour. */
export const SWATCH_GROUP_CODES: readonly OptionGroupCode[] = ['COLOUR', 'PATTERN_COLOUR'];
export const isSwatchGroup = (code: OptionGroupCode): boolean => SWATCH_GROUP_CODES.includes(code);

export const SELECTION_TYPES = ['SINGLE', 'MULTI'] as const;
export type SelectionType = (typeof SELECTION_TYPES)[number];

export const SIZE_BAND_CODES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'CUSTOM'] as const;
export type SizeBandCode = (typeof SIZE_BAND_CODES)[number];

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** In production order (headline stage and sorting rely on it). */
export const PRODUCTION_STAGES = [
  'PLACED',
  'SPEC_APPROVED',
  'PATTERN',
  'CUTTING',
  'STITCHING',
  'QC',
  'FINISHING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REMAKE',
  'ON_HOLD',
  /** Old flow (before the workshop stations); kept so history stays readable. Never entered now. */
  'ASSIGNED',
] as const;
export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

/** Customer-facing labels for production stages. */
export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = {
  PLACED: 'Order placed',
  SPEC_APPROVED: 'Design confirmed',
  PATTERN: 'Pattern being made',
  CUTTING: 'Being cut',
  STITCHING: 'Stitching',
  QC: 'Quality check',
  FINISHING: 'Finishing touches',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REMAKE: 'Being remade',
  // A workshop query is internal; customers just see their abaya is in production.
  ON_HOLD: 'In production',
  ASSIGNED: 'In production',
};

/**
 * The steps customers see on their order page (web and app). Workshop-internal stages fold
 * into the nearest customer step: finishing is part of the quality check, and a query on
 * hold, a remake or the old ASSIGNED stage show as the pattern step.
 */
export const CUSTOMER_STAGE_FLOW: readonly ProductionStage[] = [
  'PLACED',
  'SPEC_APPROVED',
  'PATTERN',
  'CUTTING',
  'STITCHING',
  'QC',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
];

export function customerStage(stage: ProductionStage): ProductionStage {
  if (stage === 'FINISHING') return 'QC';
  if (stage === 'ON_HOLD' || stage === 'REMAKE' || stage === 'ASSIGNED') return 'PATTERN';
  return stage;
}

/** The six workshop stations (docs/apps/workshop.md), in production order. */
export const WORKSHOP_STATIONS = ['pattern', 'cutting', 'stitching', 'qc', 'finishing', 'logistics'] as const;
export type WorkshopStation = (typeof WORKSHOP_STATIONS)[number];

/** The role that works each station. PRODUCTION_MANAGER and SUPER_ADMIN can open every station. */
export const STATION_ROLE: Record<WorkshopStation, Role> = {
  pattern: 'PATTERN_TECHNICIAN',
  cutting: 'CUTTER',
  stitching: 'MAKER',
  qc: 'QC',
  finishing: 'FINISHER',
  logistics: 'LOGISTICS',
};

/** Stages whose items wait at (or are being worked at) each station. */
export const STATION_STAGES: Record<WorkshopStation, readonly ProductionStage[]> = {
  pattern: ['SPEC_APPROVED', 'PATTERN'],
  cutting: ['CUTTING'],
  stitching: ['STITCHING'],
  qc: ['QC'],
  finishing: ['FINISHING'],
  logistics: ['PACKED', 'SHIPPED'],
};

/** Which station an item at this stage belongs to (null: office stages such as PLACED, DELIVERED). */
export function stationForStage(stage: ProductionStage): WorkshopStation | null {
  return WORKSHOP_STATIONS.find((s) => STATION_STAGES[s].includes(stage)) ?? null;
}

/** Stations this person may open. */
export function stationsForRoles(roles: readonly Role[]): WorkshopStation[] {
  if (roles.includes('SUPER_ADMIN') || roles.includes('PRODUCTION_MANAGER')) return [...WORKSHOP_STATIONS];
  return WORKSHOP_STATIONS.filter((s) => roles.includes(STATION_ROLE[s]));
}

/**
 * Where a person lands after signing in to the staff website: office staff → the admin
 * dashboard; designers (with no other office role) → the Designer Studio; workshop-only staff →
 * their station (or the station menu when they have several).
 */
export function staffHomePath(roles: readonly Role[]): string | null {
  if (roles.some((r) => r !== 'DESIGNER' && OFFICE_ROLES.includes(r))) return '/';
  if (roles.includes('DESIGNER')) return '/studio';
  const stations = stationsForRoles(roles);
  if (stations.length === 1) return `/workshop/${stations[0]}`;
  return stations.length > 1 ? '/workshop' : null;
}

export const CONSENT_PURPOSES = [
  'TERMS',
  'PRIVACY',
  'MARKETING',
  'MEASUREMENT_PHOTOS',
  'WHATSAPP_UPDATES', // order updates on WhatsApp; the customer's phone must be set
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const REFERENCE_SOURCES = ['PINTEREST', 'FASHION_API', 'MANUAL_UPLOAD'] as const;
export type ReferenceSource = (typeof REFERENCE_SOURCES)[number];

export const PAYMENT_STATUSES = [
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = ['PENDING', 'PROCESSED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const TECH_PACK_STATUSES = ['DRAFT', 'APPROVED'] as const;
export type TechPackStatus = (typeof TECH_PACK_STATUSES)[number];

export const SHIPMENT_STATUSES = ['PENDING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** Current version of the terms/privacy text shown at signup. Bump when policies change. */
export const POLICY_VERSION = '2026-10-01';

/** SUPPORT may refund up to ₹5,000 per refund; larger refunds need SUPER_ADMIN. */
export const SUPPORT_REFUND_LIMIT_IN_PAISE = 500_000;

export const DEVICE_PLATFORMS = ['ANDROID', 'IOS'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** Mobile apps that register push tokens (tailors work in the /workshop website). */
export const CLIENT_APPS = ['CUSTOMER'] as const;
export type ClientApp = (typeof CLIENT_APPS)[number];

/** Hours an order may wait for payment before it is closed as "payment not completed". */
export const CHECKOUT_EXPIRY_HOURS = 24;

/**
 * A checkout that was never paid: closed because payment could not start or never arrived
 * (status CANCELLED, no placedAt). It is not an order the customer placed, so it is not
 * counted in totals and is hidden from the customer's orders.
 */
export const isPaymentNotCompleted = (o: { status: string; placedAt: string | Date | null }): boolean =>
  o.status === 'CANCELLED' && !o.placedAt;
