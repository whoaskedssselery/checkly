import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

function run(exception: unknown, type = 'http') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    getType: () => type,
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return { status, json };
}

describe('ApiExceptionFilter', () => {
  it.each([
    [new BadRequestException('bad'), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedException(), 401, 'UNAUTHORIZED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new NotFoundException('gone'), 404, 'NOT_FOUND'],
    [new ConflictException('dup'), 409, 'CONFLICT'],
    [new HttpException('slow down', 429), 429, 'RATE_LIMITED'],
  ])('maps exception %#: status %i to code %s', (exception, status, code) => {
    const out = run(exception);
    expect(out.status).toHaveBeenCalledWith(status);
    expect(out.json.mock.calls[0][0].error.code).toBe(code);
  });

  it('uses the code a handler put in the payload, and passes field messages through', () => {
    const out = run(
      new ConflictException({ code: 'EMAIL_TAKEN', message: 'taken', fields: { email: 'x' } }),
    );
    expect(out.json).toHaveBeenCalledWith({
      error: { code: 'EMAIL_TAKEN', message: 'taken', fields: { email: 'x' } },
    });
  });

  it('joins an array of validation messages into one message', () => {
    const out = run(new BadRequestException({ message: ['a', 'b'] }));
    expect(out.json.mock.calls[0][0].error.message).toBe('a; b');
  });

  it('answers an unexpected error with a bare 500 and never leaks its message or stack', () => {
    const out = run(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));
    expect(out.status).toHaveBeenCalledWith(500);
    const body = JSON.stringify(out.json.mock.calls[0][0]);
    expect(body).toContain('SERVER_ERROR');
    expect(body).not.toMatch(/ECONNREFUSED|hunter2|10\.0\.0\.5/);
  });

  it('treats a middleware 4xx (body too large) as the client error it is, not a 500', () => {
    const out = run(Object.assign(new Error('request entity too large'), { status: 413 }));
    expect(out.status).toHaveBeenCalledWith(413);
    expect(out.json.mock.calls[0][0].error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('leaves non-HTTP contexts (sockets) alone', () => {
    const out = run(new Error('x'), 'ws');
    expect(out.status).not.toHaveBeenCalled();
  });
});
