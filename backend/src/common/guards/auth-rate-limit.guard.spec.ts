import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

const config = (limit: number) => ({ get: () => String(limit) }) as unknown as ConfigService;

function ctx(ip: string, path: string) {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ ip, path }), getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

describe('AuthRateLimitGuard', () => {
  afterEach(() => jest.useRealTimers());

  it('lets the first N attempts through and then answers 429 with Retry-After', () => {
    const guard = new AuthRateLimitGuard(config(3));
    for (let i = 0; i < 3; i++) {
      expect(guard.canActivate(ctx('1.1.1.1', '/auth/login').context)).toBe(true);
    }

    const blocked = ctx('1.1.1.1', '/auth/login');
    let caught: HttpException | undefined;
    try {
      guard.canActivate(blocked.context);
    } catch (e) {
      caught = e as HttpException;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(429);
    expect(caught?.getResponse()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(blocked.setHeader).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
  });

  it('counts each address and each route separately', () => {
    const guard = new AuthRateLimitGuard(config(1));
    expect(guard.canActivate(ctx('1.1.1.1', '/auth/login').context)).toBe(true);
    expect(guard.canActivate(ctx('2.2.2.2', '/auth/login').context)).toBe(true);
    expect(guard.canActivate(ctx('1.1.1.1', '/auth/register').context)).toBe(true);
    expect(() => guard.canActivate(ctx('1.1.1.1', '/auth/login').context)).toThrow(HttpException);
  });

  it('lets an address try again once the minute is up', () => {
    jest.useFakeTimers();
    const guard = new AuthRateLimitGuard(config(1));
    guard.canActivate(ctx('1.1.1.1', '/auth/login').context);
    expect(() => guard.canActivate(ctx('1.1.1.1', '/auth/login').context)).toThrow(HttpException);

    jest.advanceTimersByTime(60_001);
    expect(guard.canActivate(ctx('1.1.1.1', '/auth/login').context)).toBe(true);
  });

  it('defaults to 10 a minute when nothing is configured', () => {
    const guard = new AuthRateLimitGuard({ get: () => undefined } as unknown as ConfigService);
    for (let i = 0; i < 10; i++) guard.canActivate(ctx('9.9.9.9', '/auth/login').context);
    expect(() => guard.canActivate(ctx('9.9.9.9', '/auth/login').context)).toThrow(HttpException);
  });
});
