import { DomainError } from '../../../common/errors/domain-error';

export { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';

/** Someone else changed the item at the same moment; the client should reload and retry. */
export class ConflictRetryError extends DomainError {
  constructor() {
    super('CONFLICT', 'STALE_STAGE', 'This item was just updated by someone else. Reload and try again.');
  }
}
