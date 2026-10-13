/**
 * HD design downloads: plain rules (no framework). A download is a purchase of a design's
 * full-quality images for personal use; every file carries a licence notice naming the
 * purchase, so a shared file can be traced back to it.
 */

/** Short, non-personal reference printed in each file (never the buyer's name or email). */
export const licenceCode = (downloadId: string): string => `L-${downloadId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
export const buyerCode = (userId: string): string => `C-${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

export function licenceNotice(input: { downloadId: string; userId: string; designName: string }): string {
  return (
    `"${input.designName}" by Abaya. Licence ${licenceCode(input.downloadId)} for customer ${buyerCode(input.userId)}. ` +
    'Personal use only: not for resale, sharing, publishing or making abayas to sell.'
  );
}

/** e.g. "pearl-cuff-butterfly-2.jpg" */
export const downloadFileName = (slug: string, index: number): string => `${slug}-${index + 1}.jpg`;

/** Where the stamped copy of image `index` of a purchase is kept (private bucket). */
export const stampedPath = (downloadId: string, index: number): string => `downloads/${downloadId}/${index + 1}.jpg`;
