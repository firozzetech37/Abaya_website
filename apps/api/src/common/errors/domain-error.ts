/**
 * Base class for business errors. Plain TypeScript so every domain/ folder may
 * extend it; the global exception filter maps `kind` to an HTTP status.
 */
export type DomainErrorKind =
  | 'VALIDATION' // 400
  | 'UNAUTHENTICATED' // 401
  | 'FORBIDDEN' // 403
  | 'NOT_FOUND' // 404
  | 'CONFLICT' // 409
  | 'BUSINESS_RULE' // 422
  | 'UPSTREAM'; // 502 — a payment/storage provider failed

export class DomainError extends Error {
  constructor(
    public readonly kind: DomainErrorKind,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, details?: unknown) {
    super('NOT_FOUND', 'NOT_FOUND', `${entity} not found.`, details);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You are not allowed to do this.', code = 'FORBIDDEN', details?: unknown) {
    super('FORBIDDEN', code, message, details);
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(entity: string, from: string, to: string) {
    super('CONFLICT', 'INVALID_TRANSITION', `${entity} cannot move from ${from} to ${to}.`, {
      from,
      to,
    });
  }
}

export class AlreadyExistsError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', 'ALREADY_EXISTS', message, details);
  }
}

export class BusinessRuleError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super('BUSINESS_RULE', code, message, details);
  }
}

export class UpstreamError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super('UPSTREAM', code, message, details);
  }
}
