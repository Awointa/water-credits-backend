import { Throttle, SkipThrottle } from '@nestjs/throttler';

/**
 * Pre-configured throttle profiles matching the rate limits documented
 * in the API reference.
 *
 * Usage:
 *   @ThrottlePublic()    – 10 requests / 60 s  (auth challenge, register)
 *   @ThrottleSensor()   – 1 000 requests / 60 s (sensor ingestion)
 *   @ThrottleOracle()   – 30 requests / 60 s  (oracle trigger)
 *   @ThrottleAdmin()    – 20 requests / 60 s  (admin endpoints)
 *   @SkipThrottle()     – no rate limiting     (internal / health)
 */

/** 10 req / 60 s — public unauthenticated endpoints */
export const ThrottlePublic = () => Throttle({ default: { limit: 10, ttl: 60000 } });

/** 1 000 req / 60 s — sensor device ingestion */
export const ThrottleSensor = () => Throttle({ default: { limit: 1000, ttl: 60000 } });

/** 30 req / 60 s — oracle trigger and submission endpoints */
export const ThrottleOracle = () => Throttle({ default: { limit: 30, ttl: 60000 } });

/** 20 req / 60 s — admin-only endpoints */
export const ThrottleAdmin = () => Throttle({ default: { limit: 20, ttl: 60000 } });

export { SkipThrottle };
