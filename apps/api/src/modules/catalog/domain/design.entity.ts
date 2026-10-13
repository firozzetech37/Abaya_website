import {
  type AbayaStyle,
  canTransitionDesign,
  DESIGN_TRANSITIONS,
  type DesignStatus,
  type Role,
} from '@abaya/contracts';
import { ForbiddenError, InvalidTransitionError } from '../../../common/errors/domain-error';
import { DesignNotEditableError, DesignPreconditionError } from './design.errors';

/** Facts about related data that the status preconditions need (docs/domain-model.md §2). */
export interface TransitionContext {
  imageCount: number;
  hasPrimaryImage: boolean;
  /** Required option groups that have no active allowed value for this design. */
  requiredGroupsWithoutOptions: string[];
  activeSizeBandCount: number;
}

export interface DesignActor {
  userId: string;
  roles: readonly Role[];
}

export interface DesignProps {
  id: string;
  name: string;
  style: AbayaStyle | null;
  status: DesignStatus;
  designerId: string | null;
  basePriceInPaise: number | null;
  reviewNotes: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

const isManager = (a: DesignActor) => a.roles.includes('SUPER_ADMIN') || a.roles.includes('CATALOG_MANAGER');
const isDesigner = (a: DesignActor) => a.roles.includes('DESIGNER');

/** DESIGNER is the user's only staff role (CUSTOMER does not count). */
export const isDesignerOnly = (a: DesignActor): boolean =>
  isDesigner(a) && a.roles.every((r) => r === 'DESIGNER' || r === 'CUSTOMER');

/** Who may perform each transition. `own` = the design's designer. */
const TRANSITION_ROLES: Record<string, 'manager' | 'manager-or-own-designer'> = {
  'DRAFT->IN_REVIEW': 'manager-or-own-designer',
  'IN_REVIEW->CHANGES_REQUESTED': 'manager',
  'CHANGES_REQUESTED->IN_REVIEW': 'manager-or-own-designer',
  'IN_REVIEW->PRICED': 'manager',
  'PRICED->PUBLISHED': 'manager',
  'PUBLISHED->ARCHIVED': 'manager',
  'ARCHIVED->PUBLISHED': 'manager',
  'PUBLISHED->PRICED': 'manager',
};

/** The Design aggregate: status machine, role rules and preconditions. Plain TypeScript. */
export class Design {
  private constructor(private props: DesignProps) {}

  static fromProps(props: DesignProps): Design {
    return new Design({ ...props });
  }

  get id() {
    return this.props.id;
  }
  get status() {
    return this.props.status;
  }
  get snapshot(): Readonly<DesignProps> {
    return { ...this.props };
  }

  private isOwnDesigner(actor: DesignActor): boolean {
    return isDesigner(actor) && this.props.designerId === actor.userId;
  }

  /** Managers edit anything; a designer edits only their own design while DRAFT or CHANGES_REQUESTED. */
  canEditDetails(actor: DesignActor): boolean {
    if (isManager(actor)) return true;
    return this.isOwnDesigner(actor) && (this.status === 'DRAFT' || this.status === 'CHANGES_REQUESTED');
  }

  assertCanEditDetails(actor: DesignActor): void {
    if (!this.canEditDetails(actor)) throw new DesignNotEditableError();
  }

  /** Base price, per-design surcharges and allowed options are set by catalog managers only. */
  assertCanEditPricing(actor: DesignActor): void {
    if (!isManager(actor)) {
      throw new ForbiddenError('Only a catalog manager can change prices and options.');
    }
  }

  /** Staff see every design, except users whose only staff role is DESIGNER: they see their own. */
  canView(actor: DesignActor): boolean {
    return !isDesignerOnly(actor) || this.props.designerId === actor.userId;
  }

  private mayPerform(actor: DesignActor, to: DesignStatus): boolean {
    const rule = TRANSITION_ROLES[`${this.status}->${to}`];
    if (!rule) return false;
    if (isManager(actor)) return true;
    return rule === 'manager-or-own-designer' && this.isOwnDesigner(actor);
  }

  /** Statuses the actor may move to now, ignoring preconditions (for UI buttons). */
  allowedTransitionsFor(actor: DesignActor): DesignStatus[] {
    return DESIGN_TRANSITIONS[this.status].filter((to) => this.mayPerform(actor, to));
  }

  /**
   * Move to `to`, enforcing DESIGN_TRANSITIONS, the role table and preconditions.
   * Returns the previous status.
   */
  transition(
    actor: DesignActor,
    to: DesignStatus,
    ctx: TransitionContext,
    notes?: string,
    now: Date = new Date(),
  ): DesignStatus {
    const from = this.status;
    if (!canTransitionDesign(from, to)) throw new InvalidTransitionError('Design', from, to);
    if (!this.mayPerform(actor, to)) {
      throw new ForbiddenError(`You cannot move a design from ${from} to ${to}.`);
    }

    if (to === 'IN_REVIEW') this.assertReadyForReview(ctx);
    if (to === 'CHANGES_REQUESTED' && !notes?.trim()) {
      throw new DesignPreconditionError('REVIEW_NOTES_REQUIRED', 'Explain what needs to change.');
    }
    if (to === 'PRICED' && from === 'IN_REVIEW') this.assertPriceable(ctx);
    if (to === 'PUBLISHED') {
      this.assertPriceable(ctx); // ARCHIVED → PUBLISHED must still pass the PRICED checks
      if (!ctx.hasPrimaryImage) {
        throw new DesignPreconditionError('PRIMARY_IMAGE_REQUIRED', 'Choose a primary image before publishing.');
      }
    }

    this.props.status = to;
    if (to === 'CHANGES_REQUESTED') this.props.reviewNotes = notes!.trim();
    if (to === 'PRICED' && from === 'IN_REVIEW') this.props.reviewNotes = null;
    if (to === 'PUBLISHED') {
      this.props.publishedAt = now;
      this.props.archivedAt = null;
    }
    if (to === 'ARCHIVED') this.props.archivedAt = now;
    return from;
  }

  private assertReadyForReview(ctx: TransitionContext): void {
    if (!this.props.name.trim()) throw new DesignPreconditionError('NAME_REQUIRED', 'Add a name.');
    if (!this.props.style) throw new DesignPreconditionError('STYLE_REQUIRED', 'Choose a style.');
    if (ctx.imageCount < 1) {
      throw new DesignPreconditionError('IMAGE_REQUIRED', 'Upload at least one image before review.');
    }
  }

  private assertPriceable(ctx: TransitionContext): void {
    if (this.props.basePriceInPaise === null || this.props.basePriceInPaise <= 0) {
      throw new DesignPreconditionError('PRICE_NOT_SET', 'Set a base price first.');
    }
    if (ctx.requiredGroupsWithoutOptions.length > 0) {
      throw new DesignPreconditionError(
        'REQUIRED_OPTIONS_MISSING',
        `Allow at least one option in: ${ctx.requiredGroupsWithoutOptions.join(', ')}.`,
      );
    }
    if (ctx.activeSizeBandCount < 1) {
      throw new DesignPreconditionError('SIZE_BAND_REQUIRED', 'Enable at least one size band.');
    }
  }
}
