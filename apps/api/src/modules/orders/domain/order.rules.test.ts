import { describe, expect, it } from 'vitest';
import type { Role } from '@abaya/contracts';
import {
  assertStageChange,
  formatOrderNumber,
  headlineStage,
  isCancellable,
  orderStatusWhenItemsFinish,
  requiresPhoto,
  type StageChangeRequest,
} from './order.rules';

const PM: Role[] = ['PRODUCTION_MANAGER'];
const QC: Role[] = ['QC'];
const SUPPORT: Role[] = ['SUPPORT'];

const req = (over: Partial<StageChangeRequest>): StageChangeRequest => ({
  from: 'PATTERN',
  to: 'CUTTING',
  flow: 'generic',
  actorRoles: PM,
  orderStatus: 'PAID',
  ...over,
});

describe('order numbers', () => {
  it('pads the sequence', () => {
    expect(formatOrderNumber(2026, 123)).toBe('AB-2026-000123');
    expect(formatOrderNumber(2027, 1234567)).toBe('AB-2027-1234567');
  });
});

describe('stage changes', () => {
  it('lets each workshop station take its own step, and only its own', () => {
    const step = (from: StageChangeRequest['from'], to: StageChangeRequest['to'], roles: Role[], photoPath?: string) =>
      assertStageChange(req({ from, to, actorRoles: roles, photoPath }));
    expect(() => step('SPEC_APPROVED', 'PATTERN', ['PATTERN_TECHNICIAN'])).not.toThrow();
    expect(() => step('PATTERN', 'CUTTING', ['PATTERN_TECHNICIAN'])).not.toThrow();
    expect(() => step('CUTTING', 'STITCHING', ['CUTTER'], 'p')).not.toThrow();
    expect(() => step('STITCHING', 'QC', ['MAKER'], 'p')).not.toThrow();
    expect(() => step('FINISHING', 'PACKED', ['FINISHER'], 'p')).not.toThrow();
    expect(() => step('SHIPPED', 'DELIVERED', ['LOGISTICS'])).not.toThrow();

    expect(() => step('PATTERN', 'CUTTING', ['CUTTER'])).toThrow(/cannot move items to CUTTING/);
    expect(() => step('CUTTING', 'STITCHING', ['PATTERN_TECHNICIAN'], 'p')).toThrow(/STITCHING/);
    expect(() => step('STITCHING', 'QC', ['CUTTER'], 'p')).toThrow(/QC/);
    expect(() => step('FINISHING', 'PACKED', ['LOGISTICS'], 'p')).toThrow(/PACKED/);
    expect(() => step('PATTERN', 'CUTTING', SUPPORT)).toThrow(/CUTTING/);
    expect(() => step('PATTERN', 'CUTTING', ['SUPER_ADMIN'])).not.toThrow();
  });

  it('refuses backward and skipping moves', () => {
    expect(() => assertStageChange(req({ from: 'CUTTING', to: 'PATTERN' }))).toThrow(/cannot move/);
    expect(() => assertStageChange(req({ from: 'PATTERN', to: 'QC' }))).toThrow(/cannot move/);
    expect(() => assertStageChange(req({ from: 'SPEC_APPROVED', to: 'ASSIGNED' }))).toThrow(/cannot move/);
    expect(() => assertStageChange(req({ from: 'SHIPPED', to: 'CANCELLED', flow: 'cancel', note: 'x' }))).toThrow(/cannot move/);
  });

  it('only changes production on paid orders', () => {
    expect(() => assertStageChange(req({ orderStatus: 'PENDING_PAYMENT' }))).toThrow(/paid order/);
  });

  it('routes special moves through their own actions', () => {
    expect(() => assertStageChange(req({ from: 'PLACED', to: 'SPEC_APPROVED' }))).toThrow(/tech-pack action/);
    expect(() => assertStageChange(req({ from: 'PACKED', to: 'SHIPPED' }))).toThrow(/ship action/);
    expect(() => assertStageChange(req({ from: 'QC', to: 'FINISHING' }))).toThrow(/qc action/);
    expect(() => assertStageChange(req({ from: 'QC', to: 'CUTTING' }))).toThrow(/qc action/);
    expect(() => assertStageChange(req({ from: 'PATTERN', to: 'ON_HOLD', note: 'x' }))).toThrow(/hold action/);
    expect(() => assertStageChange(req({ from: 'QC', to: 'CUTTING', flow: 'qc', actorRoles: QC }))).not.toThrow();
    expect(() => assertStageChange(req({ from: 'PLACED', to: 'SPEC_APPROVED', flow: 'tech-pack' }))).not.toThrow();
  });

  it('holds pattern and cutting work with a reason and resumes it only where it stopped', () => {
    const hold = (over: Partial<StageChangeRequest>) => assertStageChange(req({ flow: 'hold', ...over }));
    expect(() => hold({ from: 'CUTTING', to: 'ON_HOLD', actorRoles: ['CUTTER'], note: 'Fabric lot differs' })).not.toThrow();
    expect(() => hold({ from: 'CUTTING', to: 'ON_HOLD', actorRoles: ['CUTTER'] })).toThrow(/note/);
    expect(() => hold({ from: 'CUTTING', to: 'ON_HOLD', actorRoles: ['PATTERN_TECHNICIAN'], note: 'x' })).toThrow(/hold or resume/);
    expect(() => hold({ from: 'ON_HOLD', to: 'CUTTING', heldFromStage: 'CUTTING', actorRoles: ['CUTTER'] })).not.toThrow();
    expect(() => hold({ from: 'ON_HOLD', to: 'PATTERN', heldFromStage: 'CUTTING', actorRoles: PM })).toThrow(/held at/);
    expect(() => hold({ from: 'ON_HOLD', to: 'PATTERN', heldFromStage: 'PATTERN', actorRoles: ['PATTERN_TECHNICIAN'] })).not.toThrow();
  });

  it('lets a tailor report a stitching problem; only the production manager resumes it or sends it to be re-cut', () => {
    const hold = (over: Partial<StageChangeRequest>) => assertStageChange(req({ flow: 'hold', ...over }));
    expect(() => hold({ from: 'STITCHING', to: 'ON_HOLD', actorRoles: ['MAKER'], note: 'Sleeve missing' })).not.toThrow();
    expect(() => hold({ from: 'ON_HOLD', to: 'STITCHING', heldFromStage: 'STITCHING', actorRoles: ['MAKER'] })).toThrow(/hold or resume/);
    expect(() => hold({ from: 'ON_HOLD', to: 'STITCHING', heldFromStage: 'STITCHING', actorRoles: PM })).not.toThrow();
    expect(() => hold({ from: 'ON_HOLD', to: 'CUTTING', heldFromStage: 'STITCHING', actorRoles: PM })).not.toThrow();
    expect(() => hold({ from: 'ON_HOLD', to: 'CUTTING', heldFromStage: 'STITCHING', actorRoles: ['CUTTER'] })).toThrow(/hold or resume/);
    expect(() => hold({ from: 'ON_HOLD', to: 'PATTERN', heldFromStage: 'STITCHING', actorRoles: PM })).toThrow(/held at/);
  });

  it('requires photos of the cut pieces, the stitched piece and the packed parcel', () => {
    expect(requiresPhoto('CUTTING', 'STITCHING')).toBe(true);
    expect(requiresPhoto('STITCHING', 'QC')).toBe(true);
    expect(requiresPhoto('FINISHING', 'PACKED')).toBe(true);
    expect(requiresPhoto('PATTERN', 'CUTTING')).toBe(false);
    expect(() => assertStageChange(req({ from: 'CUTTING', to: 'STITCHING' }))).toThrow(/stage photo/);
  });

  it('requires a note to cancel or remake', () => {
    expect(() => assertStageChange(req({ to: 'CANCELLED', flow: 'cancel' }))).toThrow(/note/);
    expect(() => assertStageChange(req({ from: 'DELIVERED', to: 'REMAKE', actorRoles: SUPPORT }))).toThrow(/note/);
    expect(() => assertStageChange(req({ from: 'DELIVERED', to: 'REMAKE', actorRoles: SUPPORT, note: 'Sleeves too short' }))).not.toThrow();
  });
});

describe('order status from items', () => {
  it('completes when everything is delivered or cancelled', () => {
    expect(orderStatusWhenItemsFinish(['DELIVERED', 'CANCELLED'])).toBe('COMPLETED');
    expect(orderStatusWhenItemsFinish(['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
    expect(orderStatusWhenItemsFinish(['DELIVERED', 'SHIPPED'])).toBeNull();
    expect(orderStatusWhenItemsFinish([])).toBeNull();
  });

  it('shows the least advanced active stage', () => {
    expect(headlineStage(['SHIPPED', 'CUTTING', 'CANCELLED'])).toBe('CUTTING');
    expect(headlineStage(['DELIVERED', 'REMAKE'])).toBe('REMAKE');
    expect(headlineStage(['PACKED', 'FINISHING'])).toBe('FINISHING');
    expect(headlineStage(['CUTTING', 'ON_HOLD'])).toBe('ON_HOLD');
    expect(headlineStage(['CANCELLED'])).toBe('CANCELLED');
    expect(headlineStage([])).toBeNull();
  });

  it('allows cancelling until shipped', () => {
    expect(isCancellable('QC')).toBe(true);
    expect(isCancellable('PACKED')).toBe(true);
    expect(isCancellable('SHIPPED')).toBe(false);
    expect(isCancellable('CANCELLED')).toBe(false);
  });
});
