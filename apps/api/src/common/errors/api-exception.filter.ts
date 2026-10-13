import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@abaya/db';
import type { ApiError } from '@abaya/contracts';
import type { Request, Response } from 'express';
import { DomainError, type DomainErrorKind } from './domain-error';

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  BUSINESS_RULE: HttpStatus.UNPROCESSABLE_ENTITY,
  UPSTREAM: HttpStatus.BAD_GATEWAY,
};

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

interface Mapped {
  status: number;
  body: ApiError['error'];
}

/** Turns every thrown error into the `apiError` shape from @abaya/contracts. Never leaks stacks. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string | number }>();
    const res = http.getResponse<Response>();
    const { status, body } = this.map(exception);

    if (status >= 500) {
      this.logger.error(
        { err: exception, path: req.url, requestId: req.id },
        exception instanceof Error ? exception.message : 'Unhandled error',
      );
    }

    const payload: ApiError = { error: { ...body, requestId: req.id ? String(req.id) : undefined } };
    res.status(status).json(payload);
  }

  private map(exception: unknown): Mapped {
    if (exception instanceof DomainError) {
      return {
        status: STATUS_BY_KIND[exception.kind],
        body: { code: exception.code, message: exception.message, details: exception.details },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);
      return {
        status,
        body: {
          code: CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL' : 'HTTP_ERROR'),
          message: status >= 500 ? 'Something went wrong.' : String(message),
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: 'ALREADY_EXISTS',
            message: 'A record with these details already exists.',
            details: { fields: exception.meta?.target },
          },
        };
      }
      if (exception.code === 'P2025') {
        return { status: HttpStatus.NOT_FOUND, body: { code: 'NOT_FOUND', message: 'Not found.' } };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL', message: 'Something went wrong.' },
    };
  }
}
