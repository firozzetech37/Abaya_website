import { describe, expect, it } from 'vitest';
import { buyerCode, downloadFileName, licenceCode, licenceNotice, stampedPath } from './download.rules';

describe('download rules', () => {
  const downloadId = '7b0c6a43-1f2e-4b8e-9d1a-2f3c4d5e6f70';
  const userId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

  it('names the purchase and buyer by code, never by personal details', () => {
    const notice = licenceNotice({ downloadId, userId, designName: 'Pearl Cuff' });
    expect(notice).toContain(licenceCode(downloadId));
    expect(notice).toContain(buyerCode(userId));
    expect(licenceCode(downloadId)).toBe('L-7B0C6A431F');
    expect(buyerCode(userId)).toBe('C-0A1B2C3D');
    expect(notice).toMatch(/Personal use only/);
  });

  it('builds file names and storage paths from 1', () => {
    expect(downloadFileName('pearl-cuff', 0)).toBe('pearl-cuff-1.jpg');
    expect(stampedPath(downloadId, 2)).toBe(`downloads/${downloadId}/3.jpg`);
  });
});
