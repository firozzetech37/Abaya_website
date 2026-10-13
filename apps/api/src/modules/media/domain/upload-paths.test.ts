import { describe, expect, it } from 'vitest';
import { assertMayUpload, assertUploadPath, buildUploadPath } from './upload-paths';

const id = '0b8f6a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b';

describe('upload paths', () => {
  it('builds dated paths without the client file name', () => {
    expect(buildUploadPath('DESIGN_IMAGE', 'image/webp', id, new Date('2026-03-05T00:00:00Z'))).toBe(
      `design-images/2026/03/${id}.webp`,
    );
  });

  it('accepts only paths issued for the same purpose', () => {
    const path = buildUploadPath('QC_PHOTO', 'image/jpeg', id);
    expect(() => assertUploadPath('QC_PHOTO', path)).not.toThrow();
    expect(() => assertUploadPath('DESIGN_IMAGE', path)).toThrow(/POST \/v1\/admin\/uploads/);
    expect(() => assertUploadPath('DESIGN_IMAGE', `design-images/2026/03/../../qc-photos/${id}.jpg`)).toThrow();
    expect(() => assertUploadPath('DESIGN_IMAGE', 'seed/foo.jpg')).toThrow();
  });

  it('checks roles per purpose', () => {
    expect(() => assertMayUpload(['DESIGNER'], 'DESIGN_IMAGE')).not.toThrow();
    expect(() => assertMayUpload(['DESIGNER'], 'QC_PHOTO')).toThrow(/cannot upload/);
    expect(() => assertMayUpload(['SUPPORT'], 'STAGE_PHOTO')).toThrow();
    expect(() => assertMayUpload(['SUPER_ADMIN'], 'REFERENCE_IMAGE')).not.toThrow();
  });
});

describe('pattern files', () => {
  const id = '0b8f6a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b';
  it('lets the pattern station upload PDFs and CAD files, and only photos elsewhere', () => {
    expect(buildUploadPath('PATTERN_FILE', 'application/dxf', id, new Date('2026-09-05T00:00:00Z'))).toBe(`pattern-files/2026/09/${id}.dxf`);
    expect(() => assertMayUpload(['PATTERN_TECHNICIAN'], 'PATTERN_FILE', 'application/pdf')).not.toThrow();
    expect(() => assertMayUpload(['CUTTER'], 'PATTERN_FILE', 'application/pdf')).toThrow(/cannot upload/);
    expect(() => assertMayUpload(['CUTTER'], 'STAGE_PHOTO', 'application/pdf')).toThrow(/cannot be uploaded here/);
    expect(() => assertUploadPath('PATTERN_FILE', `pattern-files/2026/09/${id}.pdf`)).not.toThrow();
    expect(() => assertUploadPath('PATTERN_FILE', `stage-photos/2026/09/${id}.pdf`)).toThrow();
  });
});
