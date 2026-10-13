'use client';

import type { PatternFileType, UploadUrlResponse } from '@abaya/contracts';
import { api, ApiError } from './api-client';

export type UploadPurpose = 'DESIGN_IMAGE' | 'DESIGN_SKETCH' | 'CATALOG_INPUT' | 'STAGE_PHOTO' | 'QC_PHOTO' | 'REFERENCE_IMAGE' | 'PATTERN_FILE' | 'IMAGE_CHECK';
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AcceptedType = (typeof ACCEPTED_IMAGE_TYPES)[number];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const isAcceptedImage = (file: File): file is File & { type: AcceptedType } =>
  (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);

/**
 * 1. POST /v1/admin/uploads → signed URL, 2. PUT the file there, 3. return
 * `storagePath` for the caller to attach to its record.
 */
export async function uploadImage(file: File, purpose: UploadPurpose, via: 'admin' | 'workshop' = 'admin'): Promise<string> {
  if (!isAcceptedImage(file)) {
    throw new ApiError(400, 'UNSUPPORTED_FILE', `${file.name}: only JPEG, PNG or WebP images can be uploaded.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(400, 'FILE_TOO_LARGE', `${file.name} is larger than 10 MB.`);
  }
  const fileName = file.name.slice(-120) || 'image';
  // Workshop stations (cutting, finishing…) use their own endpoint; it only issues station photos.
  const signed =
    via === 'workshop'
      ? await api.post<UploadUrlResponse>('/workshop/uploads', { contentType: file.type, purpose })
      : await api.post<UploadUrlResponse>('/admin/uploads', { fileName, contentType: file.type, purpose });
  let res: Response;
  try {
    res = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  } catch {
    throw new ApiError(0, 'UPLOAD_FAILED', `Could not upload ${file.name}. Check your connection and try again.`);
  }
  if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED', `Upload of ${file.name} failed (${res.status}).`);
  return signed.storagePath;
}

/** Pattern station files: CAD exports, PDFs, or photos of a paper pattern. */
export const PATTERN_FILE_ACCEPT = '.pdf,.dxf,image/jpeg,image/png,image/webp';
const MAX_PATTERN_BYTES = 25 * 1024 * 1024;

/** Browsers report DXF as "", "image/vnd.dxf" or "application/dxf"; normalise by extension. */
export function patternFileType(file: File): PatternFileType | null {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'dxf') return 'application/dxf';
  if (ext === 'pdf' || file.type === 'application/pdf') return 'application/pdf';
  return (['image/jpeg', 'image/png', 'image/webp'] as const).find((t) => t === file.type) ?? null;
}

/** Upload one pattern file through the workshop endpoint; returns what the pattern stores. */
export async function uploadPatternFile(file: File): Promise<{ path: string; name: string; contentType: PatternFileType }> {
  const contentType = patternFileType(file);
  if (!contentType) throw new ApiError(400, 'UNSUPPORTED_FILE', `${file.name}: only PDF, DXF or photos (JPEG, PNG, WebP).`);
  if (file.size > MAX_PATTERN_BYTES) throw new ApiError(400, 'FILE_TOO_LARGE', `${file.name} is larger than 25 MB.`);
  const signed = await api.post<UploadUrlResponse>('/workshop/uploads', { contentType, purpose: 'PATTERN_FILE' });
  let res: Response;
  try {
    res = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
  } catch {
    throw new ApiError(0, 'UPLOAD_FAILED', `Could not upload ${file.name}. Check your connection and try again.`);
  }
  if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED', `Upload of ${file.name} failed (${res.status}).`);
  return { path: signed.storagePath, name: file.name.slice(-120), contentType };
}

/** Home-page collection videos: MP4 (H.264) or WebM. 50 MB is Supabase's per-file ceiling on the free plan. */
export const VIDEO_ACCEPT = 'video/mp4,video/webm';
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export async function uploadVideo(file: File): Promise<string> {
  const contentType = file.type === 'video/webm' ? 'video/webm' : file.type === 'video/mp4' ? 'video/mp4' : null;
  if (!contentType) throw new ApiError(400, 'UNSUPPORTED_FILE', `${file.name}: only MP4 or WebM videos can be uploaded.`);
  if (file.size > MAX_VIDEO_BYTES) throw new ApiError(400, 'FILE_TOO_LARGE', `${file.name} is larger than 50 MB. Export it at 1080p (H.264) to shrink it; 4K is not needed on the website.`);
  const signed = await api.post<UploadUrlResponse>('/admin/uploads', { fileName: file.name.slice(-120) || 'video', contentType, purpose: 'COLLECTION_VIDEO' });
  let res: Response;
  try {
    res = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
  } catch {
    throw new ApiError(0, 'UPLOAD_FAILED', `Could not upload ${file.name}. Check your connection and try again.`);
  }
  if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED', `Upload of ${file.name} failed (${res.status}).`);
  return signed.storagePath;
}
