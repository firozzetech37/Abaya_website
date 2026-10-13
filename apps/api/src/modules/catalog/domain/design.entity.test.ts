import { describe, expect, it } from 'vitest';
import type { DesignStatus, Role } from '@abaya/contracts';
import { Design, type DesignProps, type TransitionContext } from './design.entity';

const DESIGNER = { userId: 'designer-1', roles: ['DESIGNER'] as Role[] };
const OTHER_DESIGNER = { userId: 'designer-2', roles: ['DESIGNER'] as Role[] };
const MANAGER = { userId: 'manager-1', roles: ['CATALOG_MANAGER'] as Role[] };
const ADMIN = { userId: 'admin-1', roles: ['SUPER_ADMIN'] as Role[] };
const QC = { userId: 'qc-1', roles: ['QC'] as Role[] };

const design = (status: DesignStatus, overrides: Partial<DesignProps> = {}) =>
  Design.fromProps({
    id: 'd1',
    name: 'Butterfly Flow',
    style: 'BUTTERFLY',
    status,
    designerId: DESIGNER.userId,
    basePriceInPaise: 329900,
    reviewNotes: null,
    publishedAt: null,
    archivedAt: null,
    ...overrides,
  });

const ready: TransitionContext = {
  imageCount: 2,
  hasPrimaryImage: true,
  requiredGroupsWithoutOptions: [],
  activeSizeBandCount: 7,
};

describe('Design transitions: status machine', () => {
  it('rejects transitions that are not in DESIGN_TRANSITIONS', () => {
    expect(() => design('DRAFT').transition(MANAGER, 'PUBLISHED', ready)).toThrow(/cannot move from DRAFT to PUBLISHED/);
    expect(() => design('PUBLISHED').transition(MANAGER, 'DRAFT', ready)).toThrow(/INVALID|cannot move/);
  });

  it('walks the happy path DRAFT → IN_REVIEW → PRICED → PUBLISHED → ARCHIVED → PUBLISHED', () => {
    const d = design('DRAFT');
    const now = new Date('2026-10-01T10:00:00Z');
    d.transition(DESIGNER, 'IN_REVIEW', ready);
    d.transition(MANAGER, 'PRICED', ready);
    d.transition(MANAGER, 'PUBLISHED', ready, undefined, now);
    expect(d.snapshot.publishedAt).toEqual(now);
    d.transition(MANAGER, 'ARCHIVED', ready);
    expect(d.snapshot.archivedAt).not.toBeNull();
    d.transition(MANAGER, 'PUBLISHED', ready);
    expect(d.status).toBe('PUBLISHED');
    expect(d.snapshot.archivedAt).toBeNull();
  });

  it('returns the previous status', () => {
    expect(design('PUBLISHED').transition(MANAGER, 'PRICED', ready)).toBe('PUBLISHED');
  });
});

describe('Design transitions: who may do what', () => {
  it('lets the owning designer submit for review, but not another designer', () => {
    expect(() => design('DRAFT').transition(OTHER_DESIGNER, 'IN_REVIEW', ready)).toThrow(/cannot move/);
    expect(design('DRAFT').transition(DESIGNER, 'IN_REVIEW', ready)).toBe('DRAFT');
  });

  it('never lets a designer price, publish, archive or request changes', () => {
    expect(() => design('IN_REVIEW').transition(DESIGNER, 'PRICED', ready)).toThrow(/cannot move/);
    expect(() => design('PRICED').transition(DESIGNER, 'PUBLISHED', ready)).toThrow(/cannot move/);
    expect(() => design('PUBLISHED').transition(DESIGNER, 'ARCHIVED', ready)).toThrow(/cannot move/);
    expect(() => design('IN_REVIEW').transition(DESIGNER, 'CHANGES_REQUESTED', ready, 'x')).toThrow(/cannot move/);
  });

  it('lets SUPER_ADMIN do anything a catalog manager can', () => {
    expect(design('PRICED').transition(ADMIN, 'PUBLISHED', ready)).toBe('PRICED');
  });

  it('does not let other staff (QC) change design status', () => {
    expect(() => design('PRICED').transition(QC, 'PUBLISHED', ready)).toThrow(/cannot move/);
  });

  it('lists only the transitions the actor may perform', () => {
    expect(design('IN_REVIEW').allowedTransitionsFor(DESIGNER)).toEqual([]);
    expect(design('IN_REVIEW').allowedTransitionsFor(MANAGER)).toEqual(['CHANGES_REQUESTED', 'PRICED']);
    expect(design('CHANGES_REQUESTED').allowedTransitionsFor(DESIGNER)).toEqual(['IN_REVIEW']);
    expect(design('CHANGES_REQUESTED').allowedTransitionsFor(OTHER_DESIGNER)).toEqual([]);
  });
});

describe('Design transitions: preconditions', () => {
  it('needs an image, a name and a style before review', () => {
    expect(() => design('DRAFT').transition(DESIGNER, 'IN_REVIEW', { ...ready, imageCount: 0 })).toThrow(/at least one image/);
    expect(() => design('DRAFT', { name: '  ' }).transition(DESIGNER, 'IN_REVIEW', ready)).toThrow(/name/);
    expect(() => design('DRAFT', { style: null }).transition(DESIGNER, 'IN_REVIEW', ready)).toThrow(/style/);
  });

  it('needs review notes to request changes, and stores them', () => {
    expect(() => design('IN_REVIEW').transition(MANAGER, 'CHANGES_REQUESTED', ready, '   ')).toThrow(/Explain/);
    const d = design('IN_REVIEW');
    d.transition(MANAGER, 'CHANGES_REQUESTED', ready, 'Shorten the sleeves');
    expect(d.snapshot.reviewNotes).toBe('Shorten the sleeves');
  });

  it('needs a base price, options in every required group and a size band to be PRICED', () => {
    expect(() => design('IN_REVIEW', { basePriceInPaise: null }).transition(MANAGER, 'PRICED', ready)).toThrow(/base price/);
    expect(() =>
      design('IN_REVIEW').transition(MANAGER, 'PRICED', { ...ready, requiredGroupsWithoutOptions: ['Fabric'] }),
    ).toThrow(/Fabric/);
    expect(() => design('IN_REVIEW').transition(MANAGER, 'PRICED', { ...ready, activeSizeBandCount: 0 })).toThrow(/size band/);
  });

  it('clears old review notes once priced', () => {
    const d = design('IN_REVIEW', { reviewNotes: 'old notes' });
    d.transition(MANAGER, 'PRICED', ready);
    expect(d.snapshot.reviewNotes).toBeNull();
  });

  it('needs a primary image to publish', () => {
    expect(() => design('PRICED').transition(MANAGER, 'PUBLISHED', { ...ready, hasPrimaryImage: false })).toThrow(/primary image/);
  });

  it('re-checks the PRICED rules when re-publishing an archived design', () => {
    expect(() =>
      design('ARCHIVED').transition(MANAGER, 'PUBLISHED', { ...ready, requiredGroupsWithoutOptions: ['Colour'] }),
    ).toThrow(/Colour/);
  });
});

describe('Design editing rights', () => {
  it('lets the owning designer edit only while DRAFT or CHANGES_REQUESTED', () => {
    expect(design('DRAFT').canEditDetails(DESIGNER)).toBe(true);
    expect(design('CHANGES_REQUESTED').canEditDetails(DESIGNER)).toBe(true);
    expect(design('IN_REVIEW').canEditDetails(DESIGNER)).toBe(false);
    expect(design('PUBLISHED').canEditDetails(DESIGNER)).toBe(false);
    expect(design('DRAFT').canEditDetails(OTHER_DESIGNER)).toBe(false);
  });

  it('lets a catalog manager edit in any status', () => {
    expect(design('PUBLISHED').canEditDetails(MANAGER)).toBe(true);
  });

  it('keeps pricing to catalog managers', () => {
    expect(() => design('DRAFT').assertCanEditPricing(DESIGNER)).toThrow(/catalog manager/);
    expect(() => design('PUBLISHED').assertCanEditPricing(MANAGER)).not.toThrow();
  });

  it('hides other designers’ designs from designer-only users, not from other staff', () => {
    expect(design('DRAFT').canView(OTHER_DESIGNER)).toBe(false);
    expect(design('DRAFT').canView(DESIGNER)).toBe(true);
    expect(design('DRAFT').canView(QC)).toBe(true);
    expect(design('DRAFT').canView({ userId: 'x', roles: ['DESIGNER', 'SUPPORT'] })).toBe(true);
  });
});
