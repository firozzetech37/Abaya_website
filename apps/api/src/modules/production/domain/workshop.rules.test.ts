import { describe, expect, it } from 'vitest';
import { actionsFor, isOverdue, mayContactCustomer, mayOpen, stationOfItem, type WorkshopItemState } from './workshop.rules';

const item = (over: Partial<WorkshopItemState>): WorkshopItemState => ({
  stage: 'CUTTING',
  heldFromStage: null,
  claimedById: null,
  isOwnStitching: false,
  assignedToId: null,
  ...over,
});
const kinds = (a: { kind: string; to: string | null }[]) => a.map((x) => (x.to ? `${x.kind}:${x.to}` : x.kind));

describe('workshop stations', () => {
  it('keeps held items with the station that held them', () => {
    expect(stationOfItem('ON_HOLD', 'CUTTING')).toBe('cutting');
    expect(stationOfItem('SPEC_APPROVED', null)).toBe('pattern');
    expect(stationOfItem('DELIVERED', null)).toBeNull();
  });

  it('lets people open only their own station, and tailors only their own work', () => {
    const open = { isOwnStitching: false, assignedToId: null };
    expect(mayOpen(['CUTTER'], 'me', 'cutting', open)).toBe(true);
    expect(mayOpen(['CUTTER'], 'me', 'pattern', open)).toBe(false);
    expect(mayOpen(['MAKER'], 'me', 'stitching', open)).toBe(false);
    expect(mayOpen(['MAKER'], 'me', 'stitching', { ...open, isOwnStitching: true })).toBe(true);
    expect(mayOpen(['PRODUCTION_MANAGER'], 'me', 'logistics', open)).toBe(true);
    expect(mayOpen(['CUTTER'], 'me', null, open)).toBe(false);
  });

  it('keeps an assigned job to its person (and managers)', () => {
    expect(mayOpen(['CUTTER'], 'me', 'cutting', { isOwnStitching: false, assignedToId: 'me' })).toBe(true);
    expect(mayOpen(['CUTTER'], 'me', 'cutting', { isOwnStitching: false, assignedToId: 'other' })).toBe(false);
    expect(mayOpen(['PRODUCTION_MANAGER'], 'me', 'cutting', { isOwnStitching: false, assignedToId: 'other' })).toBe(true);
  });

  it('shows customer contact only to dispatch and managers', () => {
    expect(mayContactCustomer(['LOGISTICS'])).toBe(true);
    expect(mayContactCustomer(['PRODUCTION_MANAGER'])).toBe(true);
    expect(mayContactCustomer(['CUTTER', 'QC', 'FINISHER', 'PATTERN_TECHNICIAN', 'MAKER'])).toBe(false);
  });
});

describe('workshop actions', () => {
  it('offers the next step of each station', () => {
    expect(kinds(actionsFor(['PATTERN_TECHNICIAN'], 'me', item({ stage: 'SPEC_APPROVED' })))).toEqual(['advance:PATTERN', 'hold:ON_HOLD']);
    expect(kinds(actionsFor(['PATTERN_TECHNICIAN'], 'me', item({ stage: 'PATTERN', claimedById: 'me' })))).toEqual([
      'release',
      'advance:CUTTING',
      'hold:ON_HOLD',
    ]);
    expect(kinds(actionsFor(['CUTTER'], 'me', item({})))).toEqual(['claim', 'advance:STITCHING', 'hold:ON_HOLD']);
    expect(kinds(actionsFor(['MAKER'], 'me', item({ stage: 'STITCHING', isOwnStitching: true })))).toEqual([
      'claim',
      'advance:QC',
      'hold:ON_HOLD',
    ]);
    expect(kinds(actionsFor(['QC'], 'me', item({ stage: 'QC' })))).toEqual(['claim', 'qc']);
    expect(kinds(actionsFor(['FINISHER'], 'me', item({ stage: 'FINISHING' })))).toEqual(['claim', 'advance:PACKED']);
    expect(kinds(actionsFor(['LOGISTICS'], 'me', item({ stage: 'PACKED' })))).toEqual(['claim', 'ship:SHIPPED']);
    expect(kinds(actionsFor(['LOGISTICS'], 'me', item({ stage: 'SHIPPED' })))).toEqual(['deliver:DELIVERED']);
  });

  it('requires photos where the work must be shown', () => {
    const photo = (roles: Parameters<typeof actionsFor>[0], stage: WorkshopItemState['stage']) =>
      actionsFor(roles, 'me', item({ stage, isOwnStitching: true })).find((a) => a.kind === 'advance')?.photoRequired;
    expect(photo(['CUTTER'], 'CUTTING')).toBe(true);
    expect(photo(['MAKER'], 'STITCHING')).toBe(true);
    expect(photo(['FINISHER'], 'FINISHING')).toBe(true);
    expect(photo(['PATTERN_TECHNICIAN'], 'PATTERN')).toBe(false);
  });

  it('keeps a job taken by someone else out of reach, except for managers', () => {
    expect(kinds(actionsFor(['CUTTER'], 'me', item({ claimedById: 'other' })))).toEqual([]);
    expect(kinds(actionsFor(['PRODUCTION_MANAGER'], 'me', item({ claimedById: 'other' })))).toEqual([
      'release',
      'advance:STITCHING',
      'hold:ON_HOLD',
    ]);
  });

  it('leaves a stitching problem to the production manager: resume or re-cut', () => {
    const held = item({ stage: 'ON_HOLD', heldFromStage: 'STITCHING', isOwnStitching: true });
    expect(actionsFor(['MAKER'], 'me', held)).toEqual([]);
    expect(kinds(actionsFor(['PRODUCTION_MANAGER'], 'me', held))).toEqual(['resume:STITCHING', 'resume:CUTTING']);
  });

  it('only offers resume on held items, and nothing to other stations', () => {
    expect(kinds(actionsFor(['CUTTER'], 'me', item({ stage: 'ON_HOLD', heldFromStage: 'CUTTING' })))).toEqual(['resume:CUTTING']);
    expect(actionsFor(['FINISHER'], 'me', item({}))).toEqual([]);
    expect(actionsFor(['MAKER'], 'me', item({ stage: 'STITCHING', isOwnStitching: false }))).toEqual([]);
  });

  it('lets the assigned person start their job but not hand it back', () => {
    const mine = item({ assignedToId: 'me' });
    expect(kinds(actionsFor(['CUTTER'], 'me', mine))).toEqual(['claim', 'advance:STITCHING', 'hold:ON_HOLD']);
    expect(kinds(actionsFor(['CUTTER'], 'me', { ...mine, claimedById: 'me' }))).toEqual(['advance:STITCHING', 'hold:ON_HOLD']);
    expect(actionsFor(['CUTTER'], 'me', item({ assignedToId: 'other' }))).toEqual([]);
    // The tailor's own job: started, never given back.
    const stitching = item({ stage: 'STITCHING', isOwnStitching: true, claimedById: 'me' });
    expect(kinds(actionsFor(['MAKER'], 'me', stitching))).toEqual(['advance:QC', 'hold:ON_HOLD']);
    // Unassigned (older orders): the open queue as before.
    expect(kinds(actionsFor(['CUTTER'], 'me', item({ claimedById: 'me' })))).toEqual(['release', 'advance:STITCHING', 'hold:ON_HOLD']);
  });

  it('flags overdue work', () => {
    const now = new Date('2026-10-02T00:00:00Z');
    expect(isOverdue(new Date('2026-10-01T00:00:00Z'), now)).toBe(true);
    expect(isOverdue(new Date('2026-10-03T00:00:00Z'), now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });
});
