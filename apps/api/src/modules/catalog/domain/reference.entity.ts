import { canTransitionReference, type ReferenceStatus, type Role } from '@abaya/contracts';
import { BusinessRuleError, ForbiddenError, InvalidTransitionError } from '../../../common/errors/domain-error';

export interface ReferenceActor {
  userId: string;
  roles: readonly Role[];
}

const isManager = (a: ReferenceActor) => a.roles.includes('SUPER_ADMIN') || a.roles.includes('CATALOG_MANAGER');

/**
 * Reference = inspiration only, never sold (docs/domain-model.md §2).
 * IMPORTED → IN_REVIEW → NEEDS_DESIGN → DESIGNED, or → REJECTED.
 */
export class ReferenceRules {
  /** Manual status changes (DESIGNED happens only when a designer creates a design from it). */
  static assertManualTransition(
    actor: ReferenceActor,
    from: ReferenceStatus,
    to: ReferenceStatus,
    assignedDesignerId: string | null,
  ): void {
    if (!isManager(actor)) throw new ForbiddenError('Only a catalog manager can review references.');
    if (!canTransitionReference(from, to)) throw new InvalidTransitionError('Reference', from, to);
    if (to === 'DESIGNED') {
      throw new BusinessRuleError(
        'DESIGN_REQUIRED',
        'A reference becomes DESIGNED when a designer creates an original design from it.',
      );
    }
    if (to === 'NEEDS_DESIGN' && !assignedDesignerId) {
      throw new BusinessRuleError('DESIGNER_REQUIRED', 'Assign a designer before sending it for design.');
    }
  }

  /** A design may be created from a reference that is NEEDS_DESIGN, by its designer or a manager. */
  static assertCanDesignFrom(
    actor: ReferenceActor,
    status: ReferenceStatus,
    assignedDesignerId: string | null,
  ): void {
    if (status !== 'NEEDS_DESIGN') {
      throw new BusinessRuleError('REFERENCE_NOT_READY', 'This reference is not waiting for a design.');
    }
    if (!isManager(actor) && assignedDesignerId !== actor.userId) {
      throw new ForbiddenError('This reference is assigned to another designer.');
    }
  }

  /** Designers only see references assigned to them. */
  static canView(actor: ReferenceActor, assignedDesignerId: string | null): boolean {
    return isManager(actor) || assignedDesignerId === actor.userId;
  }
}
