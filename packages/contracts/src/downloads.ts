/**
 * HD design downloads (docs/apps/web.md "HD download"). Customers see web previews;
 * they can order the abaya (stitched by us) or buy the design's HD images to download.
 * A download is its own purchase: never an abaya order, never sent to the workshop.
 */
import { z } from 'zod';
import type { AbayaStyle } from './enums';

/** Price when the admin has not set one for the design (₹299). */
export const DEFAULT_DOWNLOAD_PRICE_IN_PAISE = 29_900;

/** Version of the licence text shown before payment (stored with each purchase by date). */
export const DOWNLOAD_LICENCE = {
  en: 'Personal use only. You may keep these images and have this abaya made for yourself. You may not resell, share, publish or sell abayas made from this design.',
  ar: 'للاستخدام الشخصي فقط. يمكنك الاحتفاظ بهذه الصور وتفصيل هذه العباءة لنفسك. لا يجوز إعادة بيعها أو مشاركتها أو نشرها أو بيع عباءات مصنوعة من هذا التصميم.',
} as const;

export const downloadPriceOf = (design: { downloadPriceInPaise: number | null }): number =>
  design.downloadPriceInPaise ?? DEFAULT_DOWNLOAD_PRICE_IN_PAISE;

export const DOWNLOAD_STATUSES = ['PENDING_PAYMENT', 'PAID', 'CANCELLED'] as const;
export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];

/** Signed download links last 10 minutes; "My downloads" makes a new one each time. */
export const DOWNLOAD_LINK_TTL_SECONDS = 600;

/** POST /v1/me/downloads */
export const createDownloadBody = z.object({
  designId: z.string().uuid(),
  /** The customer ticked the licence box. */
  licenceAccepted: z.literal(true),
});
export type CreateDownloadBody = z.infer<typeof createDownloadBody>;

export const adminDownloadsQuery = z.object({
  status: z.enum(DOWNLOAD_STATUSES).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// ───────────── Responses ─────────────


export interface CreateDownloadResponse {
  downloadId: string;
  priceInPaise: number;
  razorpay: { keyId: string; orderId: string; amount: number; currency: 'INR' };
  paymentMode: 'razorpay' | 'test';
}

export interface DownloadDto {
  id: string;
  status: DownloadStatus;
  design: { id: string; name: string; slug: string; style: AbayaStyle };
  /** Web preview of the first image. */
  previewUrl: string | null;
  imageCount: number;
  priceInPaise: number;
  paidAt: string | null;
  createdAt: string;
}

export interface DownloadLinkDto {
  url: string;
  fileName: string;
  expiresInSeconds: number;
}

export interface AdminDownloadDto {
  id: string;
  status: DownloadStatus;
  customer: { id: string; name: string | null; email: string | null };
  design: { id: string; name: string; slug: string };
  priceInPaise: number;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminDownloadsSummaryDto {
  paidCount: number;
  revenueInPaise: number;
  paidToday: number;
}
