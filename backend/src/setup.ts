import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { allowedOrigins } from './common/cors';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { createValidationPipe } from './common/validation';

/**
 * Everything that makes the app the app, in one place: `main.ts` and the e2e
 * tests both call it, so tests exercise the real pipeline (validation, error
 * shape, security headers, CORS) and not a lookalike.
 */
export function configureApp(app: INestApplication): void {
  // Also removes X-Powered-By and sets nosniff, HSTS, frame and CSP defaults.
  app.use(helmet());
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({ origin: allowedOrigins(), credentials: true });
}
