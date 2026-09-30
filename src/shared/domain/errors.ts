/**
 * Errores de dominio tipados. La capa interface los mapea a respuestas HTTP.
 * Nunca lanzar Error genérico desde casos de uso o dominio.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
  readonly httpStatus = 422;
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  readonly httpStatus = 404;
}

export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";
  readonly httpStatus = 401;
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  readonly httpStatus = 403;
}

export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
  readonly httpStatus = 409;
}

export class BusinessRuleError extends DomainError {
  readonly code = "BUSINESS_RULE";
  readonly httpStatus = 422;
}

export class InfrastructureError extends DomainError {
  readonly code = "INFRASTRUCTURE";
  readonly httpStatus = 500;
}
