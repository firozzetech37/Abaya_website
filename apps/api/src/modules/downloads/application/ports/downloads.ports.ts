import type { AbayaStyle, DownloadStatus } from '@abaya/contracts';
import type { AuditEntry } from '../../../../common/audit/audit';

export interface DownloadRecord {
  id: string;
  userId: string;
  designId: string;
  design: { name: string; slug: string; style: AbayaStyle };
  imagePaths: string[];
  priceInPaise: number;
  status: DownloadStatus;
  licenceAcceptedAt: Date;
  paidAt: Date | null;
  createdAt: Date;
  customer: { id: string; name: string | null; email: string | null };
}

export interface DownloadRepository {
  create(input: Pick<DownloadRecord, 'userId' | 'designId' | 'design' | 'imagePaths' | 'priceInPaise' | 'licenceAcceptedAt'>): Promise<DownloadRecord>;
  findById(id: string): Promise<DownloadRecord | null>;
  findPaid(userId: string, designId: string): Promise<DownloadRecord | null>;
  listPaid(userId: string): Promise<DownloadRecord[]>;
  /** PENDING_PAYMENT → PAID once (payment webhook and client can both report it). */
  markPaid(id: string, at: Date, audit: AuditEntry): Promise<boolean>;
  listAdmin(query: { status?: DownloadStatus; cursor?: string; limit: number }): Promise<{ items: DownloadRecord[]; nextCursor: string | null }>;
  paidTotals(since: Date): Promise<{ paidCount: number; revenueInPaise: number; paidSince: number }>;
}
export const DOWNLOAD_REPOSITORY = Symbol('DOWNLOAD_REPOSITORY');

/** Short-lived links to the stamped files (private bucket). */
export interface DownloadLinks {
  signed(path: string, fileName: string, expiresInSeconds: number): Promise<string>;
}
export const DOWNLOAD_LINKS = Symbol('DOWNLOAD_LINKS');
