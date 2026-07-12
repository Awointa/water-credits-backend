import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (maxRequests: number, windowMs: number) =>
  SetMetadata(RATE_LIMIT_KEY, { maxRequests, windowMs });

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private store = new Map<string, RateLimitEntry>();
  private lastCleanup = Date.now();
  private static readonly CLEANUP_INTERVAL_MS = 60_000;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const limitMeta = this.reflector.getAllAndOverride<{ maxRequests: number; windowMs: number }>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!limitMeta) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const key = request.ip || 'anonymous';
    const now = Date.now();

    if (now - this.lastCleanup > RateLimitGuard.CLEANUP_INTERVAL_MS) {
      this.cleanup(now);
    }

    let entry = this.store.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + limitMeta.windowMs };
      this.store.set(key, entry);
    }

    entry.count++;
    if (entry.count > limitMeta.maxRequests) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private cleanup(now: number): void {
    for (const [key, entry] of this.store) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
    this.lastCleanup = now;
  }
}
