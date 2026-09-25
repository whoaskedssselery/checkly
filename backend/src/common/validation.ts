import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Transform } from 'class-transformer';
import type { ValidationError } from 'class-validator';

/** Turn class-validator's tree into `{ 'position.x': 'message', ... }`. */
export function flattenErrors(errors: ValidationError[], prefix = ''): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) {
      fields[path] = Object.values(error.constraints)[0];
    }
    if (error.children?.length) Object.assign(fields, flattenErrors(error.children, path));
  }
  return fields;
}

/** The app-wide pipe: strips unknown fields, and reports per-field messages. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fields: flattenErrors(errors),
      }),
  });
}

/**
 * Trim a string BEFORE it is validated, so "   " counts as empty instead of
 * passing `MinLength(1)` and being stored as an empty title.
 */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
