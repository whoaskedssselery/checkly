import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** The error codes the frontend understands (docs/release/openapi.yaml). */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

/** What a handler puts inside an HttpException to name its own code. */
export interface CodedPayload {
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string>;
}

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * One error shape for the whole API: `{ error: { code, message, fields? } }`.
 * Never a stack trace, never a database message — an unexpected exception is
 * logged here and answered with a bare 500.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      // Errors raised by Express middleware (body too large, malformed JSON)
      // carry their own 4xx status; they are the client's fault, not ours.
      const status = clientErrorStatus(exception);
      if (status) {
        const code = CODE_BY_STATUS[status] ?? 'VALIDATION_ERROR';
        const message = status === 413 ? 'Request body is too large' : 'Malformed request';
        res.status(status).json({ error: { code, message } });
        return;
      }
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : exception);
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
      return;
    }

    const status = exception.getStatus();
    const { code, message, fields } = describe(status, exception.getResponse());
    res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
  }
}

function describe(status: number, body: string | object): CodedPayload {
  const fallback = CODE_BY_STATUS[status] ?? (status >= 500 ? 'SERVER_ERROR' : 'VALIDATION_ERROR');
  if (typeof body === 'string') return { code: fallback, message: body };

  const b = body as Partial<CodedPayload> & { message?: string | string[] };
  const message = Array.isArray(b.message) ? b.message.join('; ') : (b.message ?? 'Error');
  return { code: b.code ?? fallback, message, fields: b.fields };
}

/** The 4xx status an Express/body-parser error carries, if it has one. */
function clientErrorStatus(exception: unknown): number | null {
  const e = exception as { status?: unknown; statusCode?: unknown } | null;
  const status = typeof e?.status === 'number' ? e.status : e?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}
