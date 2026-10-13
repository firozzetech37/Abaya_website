import type { Role } from '@abaya/contracts';
import { BusinessRuleError, ForbiddenError } from '../../../common/errors/domain-error';

export type UploadPurpose = 'DESIGN_IMAGE' | 'DESIGN_SKETCH' | 'CATALOG_INPUT' | 'CATALOG_IMAGE' | 'STAGE_PHOTO' | 'QC_PHOTO' | 'REFERENCE_IMAGE' | 'PATTERN_FILE' | 'TRYON_PHOTO' | 'CUSTOMER_PREVIEW' | 'COLLECTION_VIDEO' | 'IMAGE_CHECK' | 'ORDER_AI_PREVIEW';
export type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | 'application/dxf' | 'video/mp4' | 'video/webm';

const IMAGE_TYPES: UploadContentType[] = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Every upload goes to the PRIVATE bucket under a folder per purpose. Design
 * images are copied to the public bucket only when the design is published.
 */
const RULES: Record<UploadPurpose, { folder: string; roles: Role[]; types?: UploadContentType[] }> = {
  DESIGN_IMAGE: { folder: 'design-images', roles: ['DESIGNER', 'CATALOG_MANAGER'] },
  // Studio: the designer's own sketch, sent to the image model as a guide (never Pinterest images).
  DESIGN_SKETCH: { folder: 'design-sketches', roles: ['DESIGNER', 'CATALOG_MANAGER'] },
  // AI Catalog: abaya photos, personal-model photos and edit masks sent to FASHN.
  CATALOG_INPUT: { folder: 'catalog-inputs', roles: ['DESIGNER', 'CATALOG_MANAGER'] },
  // AI Catalog results (made by the server only; nobody uploads these).
  CATALOG_IMAGE: { folder: 'catalog-images', roles: [] },
  REFERENCE_IMAGE: { folder: 'references', roles: ['CATALOG_MANAGER'] },
  // Home page: a short looping video behind a collection (copied to the public bucket when saved).
  COLLECTION_VIDEO: { folder: 'collection-videos', roles: ['CATALOG_MANAGER'], types: ['video/mp4', 'video/webm'] },
  // Website try-on: the customer's own photo (private, deleted after 30 days).
  TRYON_PHOTO: { folder: 'tryon-photos', roles: ['CUSTOMER'] },
  // Website AI previews and try-on results (made by the server only).
  CUSTOMER_PREVIEW: { folder: 'customer-previews', roles: [] },
  // Pattern station: CAD exports, PDFs or photos of a paper pattern.
  PATTERN_FILE: {
    folder: 'pattern-files',
    roles: ['PATTERN_TECHNICIAN', 'PRODUCTION_MANAGER'],
    types: [...IMAGE_TYPES, 'application/pdf', 'application/dxf'],
  },
  // Workshop stations photograph their work (cut pieces, stitched piece, packed parcel).
  STAGE_PHOTO: { folder: 'stage-photos', roles: ['PRODUCTION_MANAGER', 'QC', 'MAKER', 'PATTERN_TECHNICIAN', 'CUTTER', 'FINISHER', 'LOGISTICS'] },
  QC_PHOTO: { folder: 'qc-photos', roles: ['QC', 'PRODUCTION_MANAGER'] },
  // Admin "Check an image": a picture found elsewhere, read for our watermark, deleted straight after.
  IMAGE_CHECK: { folder: 'image-checks', roles: ['CATALOG_MANAGER'] },
  // A customer's website AI preview kept with her bag item and order for the workshop (made by the server only; never a try-on).
  ORDER_AI_PREVIEW: { folder: 'order-ai-previews', roles: [] },
};

const EXTENSION: Record<UploadContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/dxf': 'dxf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function assertMayUpload(roles: readonly Role[], purpose: UploadPurpose, contentType?: UploadContentType): void {
  // Only pattern files may be documents; everything else is a photo.
  if (contentType && !(RULES[purpose].types ?? IMAGE_TYPES).includes(contentType)) {
    throw new BusinessRuleError('UNSUPPORTED_FILE_TYPE', 'This kind of file cannot be uploaded here.');
  }
  if (roles.includes('SUPER_ADMIN')) return;
  if (!RULES[purpose].roles.some((r) => roles.includes(r))) {
    throw new ForbiddenError('You cannot upload this kind of file.');
  }
}

/** design-images/2026/09/<uuid>.jpg — the client's file name is never used in the path. */
export function buildUploadPath(purpose: UploadPurpose, contentType: UploadContentType, id: string, now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${RULES[purpose].folder}/${yyyy}/${mm}/${id}.${EXTENSION[contentType]}`;
}

/** Rejects paths that were not issued for this purpose (e.g. attaching someone's QC photo to a design). */
export function assertUploadPath(purpose: UploadPurpose, path: string): void {
  const pattern = new RegExp(`^${RULES[purpose].folder}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.(jpg|png|webp|pdf|dxf|mp4|webm)$`);
  if (!pattern.test(path)) {
    throw new BusinessRuleError('INVALID_UPLOAD_PATH', 'Upload the file through POST /v1/admin/uploads first.');
  }
}
