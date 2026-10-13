import { describe, expect, it } from 'vitest';
import { createDownloadBody, DEFAULT_DOWNLOAD_PRICE_IN_PAISE, downloadPriceOf } from './downloads';
import { updateDesignBody } from './schemas';

describe('HD downloads', () => {
  it('uses the default price unless the design has its own', () => {
    expect(downloadPriceOf({ downloadPriceInPaise: null })).toBe(DEFAULT_DOWNLOAD_PRICE_IN_PAISE);
    expect(downloadPriceOf({ downloadPriceInPaise: 49_900 })).toBe(49_900);
  });

  it('needs the licence accepted', () => {
    const designId = '7b0c6a43-1f2e-4b8e-9d1a-2f3c4d5e6f70';
    expect(createDownloadBody.safeParse({ designId, licenceAccepted: true }).success).toBe(true);
    expect(createDownloadBody.safeParse({ designId, licenceAccepted: false }).success).toBe(false);
    expect(createDownloadBody.safeParse({ designId }).success).toBe(false);
  });

  it('keeps the download price within ₹1 – ₹10,000', () => {
    expect(updateDesignBody.safeParse({ downloadPriceInPaise: 50 }).success).toBe(false);
    expect(updateDesignBody.safeParse({ downloadPriceInPaise: 2_000_000 }).success).toBe(false);
    expect(updateDesignBody.safeParse({ downloadPriceInPaise: null, downloadEnabled: true }).success).toBe(true);
  });
});
