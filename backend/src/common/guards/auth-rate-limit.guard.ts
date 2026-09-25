import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

const WINDOW_MS = 60_000;

/**
 * Brute-force brake for the auth routes: at most `AUTH_RATE_LIMIT` calls per
 * minute from one address to one route (default 10), then 429 with
 * Retry-After. In memory, per process — fine for one instance; put a shared
 * store behind it if the API is ever scaled out.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const limit = Number(this.config.get('AUTH_RATE_LIMIT') ?? 10);
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;

    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      this.hits.set(key, recent);
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Слишком много попыток, попробуйте позже' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hits.set(key, recent);
    this.sweep(now);
    return true;
  }

  /** Forget addresses that have been quiet for a full window. */
  private sweep(now: number): void {
    if (this.hits.size < 1000) return;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) this.hits.delete(key);
    }
  }
}
