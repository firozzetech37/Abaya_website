import { Body, type PipeTransform, Query } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { DomainError } from '../errors/domain-error';

/** Validates and transforms a request part with a Zod schema from @abaya/contracts. */
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new DomainError('VALIDATION', 'VALIDATION_FAILED', 'Some fields are invalid.', result.error.issues);
    }
    return result.data;
  }
}

/** `@ZodBody(schema) body: z.infer<typeof schema>` */
export const ZodBody = (schema: ZodTypeAny): ParameterDecorator => Body(new ZodValidationPipe(schema));

/** `@ZodQuery(schema) query: z.infer<typeof schema>` */
export const ZodQuery = (schema: ZodTypeAny): ParameterDecorator => Query(new ZodValidationPipe(schema));
