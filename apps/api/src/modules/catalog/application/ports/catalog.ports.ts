import type {
  AbayaStyle,
  DesignFacetsQuery,
  DesignStatus,
  ListAdminDesignsQuery,
  ListDesignsQuery,
  ReferenceSource,
  ReferenceStatus,
} from '@abaya/contracts';
import type { AuditEntry } from '../../../../common/audit/audit';

export interface DesignImageRecord {
  id: string;
  storagePath: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
  isPrimary: boolean;
  /** Raised when the web preview is remade (its URL carries it, so caches refresh). */
  previewVersion: number;
  /** The COLOUR option value this photo shows; null = the main photoshoot, shown for every colour. */
  colourValueId: string | null;
  /** A close-up detail shot (fabric, embroidery, hem…) for the home page's craftsmanship gallery. */
  isDetail: boolean;
}

export interface DesignOptionRecord {
  optionValueId: string;
  surchargeOverrideInPaise: number | null;
  isDefault: boolean;
}

export interface DesignRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  style: AbayaStyle;
  status: DesignStatus;
  tags: string[];
  basePriceInPaise: number | null;
  makingCostInPaise: number | null;
  leadTimeDays: number;
  reviewNotes: string | null;
  designerId: string | null;
  designer: { id: string; name: string | null; email: string | null } | null;
  referenceId: string | null;
  source: 'UPLOAD' | 'AI_GENERATED';
  originalityConfirmedAt: Date | null;
  inspirationUrl: string | null;
  /** Snapshot of the AI generation (prompt, model…) for AI designs. */
  aiGeneration: unknown;
  submittedAt: Date | null;
  approvedAt: Date | null;
  downloadEnabled: boolean;
  downloadPriceInPaise: number | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  images: DesignImageRecord[];
  options: DesignOptionRecord[];
  collectionIds: string[];
  /** The collections the design belongs to, in their display order. */
  collections: { id: string; name: string; isActive: boolean; sortOrder: number }[];
}

export interface NewDesign {
  slug: string;
  name: string;
  description?: string;
  style: AbayaStyle;
  tags: string[];
  leadTimeDays: number;
  designerId: string;
  referenceId?: string;
  source?: 'UPLOAD' | 'AI_GENERATED';
  inspirationUrl?: string;
  aiGeneration?: { generationId: string; prompt: string; model: string; createdAt: string };
}

export interface DesignPatch {
  slug?: string;
  name?: string;
  description?: string;
  style?: AbayaStyle;
  tags?: string[];
  leadTimeDays?: number;
  basePriceInPaise?: number;
  makingCostInPaise?: number;
  collectionIds?: string[];
  downloadEnabled?: boolean;
  downloadPriceInPaise?: number | null;
}

export interface DesignStatusChange {
  status: DesignStatus;
  reviewNotes: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  submittedAt?: Date;
  approvedAt?: Date;
  originalityConfirmedAt?: Date;
}

/** Published designs per style (with the newest one's photo) and per colour. */
export interface DesignFacetsRecord {
  styles: { style: AbayaStyle; count: number; image: { storagePath: string; previewVersion: number } | null }[];
  colourCounts: { optionValueId: string; count: number }[];
}

export interface DesignRepository {
  /** The web previews of these photos were remade by `generation`: give them a new version (new URL). */
  bumpPreviewVersions(storagePaths: string[], generation: number): Promise<void>;
  /** Photos of live designs whose web preview was made by older code (before `generation`). */
  listStalePreviewPaths(limit: number, generation: number): Promise<{ designId: string; path: string }[]>;
  /** Image paths of every PUBLISHED or ARCHIVED design (to rebuild web previews). */
  listPublicImagePaths(): Promise<{ designId: string; paths: string[] }[]>;
  findById(id: string): Promise<DesignRecord | null>;
  findBySlug(slug: string): Promise<DesignRecord | null>;
  findManyByIds(ids: string[]): Promise<DesignRecord[]>;
  /** The design whose id starts with these 8 hex digits (watermark look-up); null when none or ambiguous. */
  findIdByPrefix(prefix: string): Promise<string | null>;
  slugTaken(slug: string, exceptId?: string): Promise<boolean>;
  /** Creates the design; when `markReferenceDesigned`, that reference becomes DESIGNED in the same transaction. */
  create(input: NewDesign, audit: AuditEntry, markReferenceDesigned?: string): Promise<DesignRecord>;
  update(id: string, patch: DesignPatch, audit: AuditEntry[]): Promise<DesignRecord>;
  saveStatus(id: string, change: DesignStatusChange, audit: AuditEntry): Promise<DesignRecord>;
  addImage(designId: string, image: Omit<DesignImageRecord, 'id' | 'sortOrder' | 'previewVersion'>): Promise<DesignRecord>;
  /** Reorder / set primary / edit alt. Ids not listed are left untouched. */
  updateImages(
    designId: string,
    images: { id: string; alt?: string | null; isPrimary: boolean; colourValueId?: string | null; isDetail?: boolean }[],
  ): Promise<DesignRecord>;
  deleteImage(designId: string, imageId: string): Promise<{ storagePath: string } | null>;
  setOptions(designId: string, options: DesignOptionRecord[], audit: AuditEntry): Promise<DesignRecord>;
  listAdmin(query: ListAdminDesignsQuery & { designerId?: string }): Promise<{
    items: DesignRecord[];
    nextCursor: string | null;
  }>;
  /** `colourValueIds`: only designs offering one of these colours (empty: none match). */
  listPublished(query: ListDesignsQuery, colourValueIds?: string[]): Promise<{ items: DesignRecord[]; nextCursor: string | null }>;
  /** Storefront filter counts (see DesignFacetsRecord). `allColourIds`: every active colour to count. */
  facets(query: DesignFacetsQuery, colourValueIds: string[] | undefined, allColourIds: string[]): Promise<DesignFacetsRecord>;
  countByStatus(status: DesignStatus): Promise<number>;
  /** One designer's designs (Studio summary). */
  listForDesigner(designerId: string): Promise<
    { id: string; name: string; status: DesignStatus; reviewNotes: string | null; updatedAt: Date; submittedAt: Date | null; approvedAt: Date | null }[]
  >;
  /** Every design image (for keeping the AI assistant in sync). */
  listAllImages(): Promise<{ id: string; designId: string; storagePath: string }[]>;
}

export interface CollectionRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  designCount: number;
  publishedDesignCount: number;
  designIds: string[];
  /** Primary photo of the newest published design in the collection (and its preview version). */
  cover: { storagePath: string; previewVersion: number } | null;
  /** Primary photos of up to three newest published designs, newest first. */
  previews: { storagePath: string; previewVersion: number }[];
  /** Looping video behind the collection on the home page (public bucket), or null. */
  videoPath: string | null;
}

export interface CollectionInput {
  slug?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
  designIds?: string[];
  videoPath?: string | null;
}

export interface CollectionRepository {
  list(onlyActive: boolean): Promise<CollectionRecord[]>;
  findBySlug(slug: string): Promise<CollectionRecord | null>;
  findById(id: string): Promise<CollectionRecord | null>;
  create(input: CollectionInput & { slug: string; name: string }): Promise<CollectionRecord>;
  update(id: string, input: CollectionInput): Promise<CollectionRecord>;
}

export interface AnnouncementRecord {
  id: string;
  textEn: string;
  textAr: string;
  linkPath: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  sortOrder: number;
  updatedAt: Date;
}

export interface AnnouncementInput {
  textEn?: string;
  textAr?: string;
  linkPath?: string | null;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  sortOrder?: number;
}

export interface AnnouncementRepository {
  list(): Promise<AnnouncementRecord[]>;
  create(input: AnnouncementInput & { textEn: string; textAr: string }): Promise<AnnouncementRecord>;
  update(id: string, input: AnnouncementInput): Promise<AnnouncementRecord | null>;
  delete(id: string): Promise<boolean>;
}

export interface ReferenceRecord {
  id: string;
  source: ReferenceSource;
  externalId: string | null;
  sourceUrl: string | null;
  imagePath: string;
  title: string | null;
  tags: string[];
  licenseNote: string | null;
  status: ReferenceStatus;
  reviewNotes: string | null;
  assignedDesigner: { id: string; name: string | null; email: string | null } | null;
  designIds: string[];
  importedAt: Date;
}

export interface ReferenceRepository {
  findById(id: string): Promise<ReferenceRecord | null>;
  /**
   * A Pinterest pin a designer saved for ideas: the link and Pinterest's own image address,
   * never a copy of the image. Assigned to that designer, ready to design from.
   */
  savePin(input: { pinId: string; url: string; imageUrl: string; title: string | null; note: string | null; designerId: string }): Promise<ReferenceRecord>;
  findManyByIds(ids: string[]): Promise<ReferenceRecord[]>;
  /** Every reference image (for keeping the AI assistant in sync). */
  listAllImages(): Promise<{ id: string; imagePath: string }[]>;
  list(query: {
    status?: ReferenceStatus;
    assignedDesignerId?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ReferenceRecord[]; nextCursor: string | null }>;
  createManual(input: {
    imagePath: string;
    title?: string;
    sourceUrl?: string;
    licenseNote?: string;
    tags: string[];
  }): Promise<ReferenceRecord>;
  update(
    id: string,
    patch: {
      title?: string;
      tags?: string[];
      licenseNote?: string;
      status?: ReferenceStatus;
      reviewNotes?: string;
      assignedDesignerId?: string | null;
    },
    audit: AuditEntry,
  ): Promise<ReferenceRecord>;
}

/** Image URLs and publishing, backed by Supabase Storage in infrastructure/. */
export interface CatalogImageStorage {
  /** URL customers see for a published design image (public bucket); `version` refreshes caches. */
  publicUrl(storagePath: string, version?: number): string;
  /** URL staff see in the admin panel: the private original (never the web preview). */
  adminUrl(storagePath: string): Promise<string>;
  /** A reference image: an external URL as-is, or a signed private URL. */
  referenceUrl(imagePath: string): Promise<string>;
  swatchUrl(path: string | null): string | null;
  /** Copy an uploaded file from the private bucket to the public one, as is (collection videos). */
  publishFile(storagePath: string): Promise<void>;
}

export const DESIGN_REPOSITORY = Symbol('DESIGN_REPOSITORY');
export const COLLECTION_REPOSITORY = Symbol('COLLECTION_REPOSITORY');
export const REFERENCE_REPOSITORY = Symbol('REFERENCE_REPOSITORY');
export const ANNOUNCEMENT_REPOSITORY = Symbol('ANNOUNCEMENT_REPOSITORY');

/** Drafts the Arabic version of a short English storefront message (an editor checks it). */
export interface Translator {
  readonly provider: 'gemini' | 'mymemory' | 'test';
  toArabic(text: string): Promise<string>;
  /** Short catalog texts (names, fabric and colour names, descriptions), same order as given. */
  toArabicMany(texts: string[]): Promise<string[]>;
}
export const TRANSLATOR = Symbol('TRANSLATOR');
export const CATALOG_IMAGE_STORAGE = Symbol('CATALOG_IMAGE_STORAGE');
