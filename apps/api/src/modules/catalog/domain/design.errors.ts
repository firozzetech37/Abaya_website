import { BusinessRuleError, ForbiddenError } from '../../../common/errors/domain-error';

export class DesignPreconditionError extends BusinessRuleError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}

export class DesignNotEditableError extends ForbiddenError {
  constructor(message = 'You cannot edit this design in its current status.') {
    super(message, 'DESIGN_NOT_EDITABLE');
  }
}

export class DesignNotPublishedError extends BusinessRuleError {
  constructor() {
    super('DESIGN_NOT_PUBLISHED', 'This design is not available.');
  }
}
