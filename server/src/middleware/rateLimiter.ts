import { Request, Response, NextFunction } from 'express';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTimeMs: number;
}

export interface IRateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

/**
 * In-memory sliding-window rate limiter.
 * Encapsulated behind IRateLimiter so it can be replaced with a Redis-backed
 * distributed rate limiter in horizontal/multi-instance deployments.
 */
export class InMemoryRateLimiter implements IRateLimiter {
  private store: Map<string, number[]> = new Map();

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.store.get(key) || [];
    // Discard timestamps outside the current window
    timestamps = timestamps.filter((ts) => ts > windowStart);

    if (timestamps.length >= limit) {
      const oldest = timestamps[0];
      const resetTimeMs = oldest + windowMs - now;
      this.store.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetTimeMs: Math.max(0, resetTimeMs),
      };
    }

    timestamps.push(now);
    this.store.set(key, timestamps);

    return {
      allowed: true,
      remaining: limit - timestamps.length,
      resetTimeMs: windowMs,
    };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Periodic cleanup helper
  cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.store.entries()) {
      const valid = timestamps.filter((ts) => ts > now - 3600000); // 1h window
      if (valid.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, valid);
      }
    }
  }
}

// Global rate limiter instance
export const rateLimiterInstance: IRateLimiter = new InMemoryRateLimiter();

/**
 * Rate limit OTP dispatch requests (e.g. 5 requests per 10 minutes per IP/identifier)
 * Prevents SMTP and Twilio SMS credit exhaustion/spam.
 */
export function otpDispatchRateLimiter(limit = 5, windowMs = 10 * 60 * 1000) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // In test environment, bypass rate limiter unless explicitly enabled
    if (process.env.NODE_ENV === 'test' && !process.env.ENABLE_TEST_RATE_LIMITS) {
      next();
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const identifier = (req.body.identifier || req.body.email || req.body.phone || '').toString().trim().toLowerCase();
    const key = `otp-dispatch:${ip}:${identifier || 'general'}`;

    const result = await rateLimiterInstance.check(key, limit, windowMs);
    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil(result.resetTimeMs / 1000);
      res.status(429).json({
        success: false,
        message: `Too many verification requests. Please wait ${retryAfterSeconds} seconds before trying again.`,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    next();
  };
}

/**
 * Rate limit OTP verification attempts at the IP/identifier level (10 requests per 10 minutes)
 * Separate from the per-challenge 5-attempt limit to prevent automated endpoint flooding.
 */
export function otpVerifyRateLimiter(limit = 10, windowMs = 10 * 60 * 1000) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // In test environment, bypass rate limiter unless explicitly enabled
    if (process.env.NODE_ENV === 'test' && !process.env.ENABLE_TEST_RATE_LIMITS) {
      next();
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `otp-verify:${ip}`;

    const result = await rateLimiterInstance.check(key, limit, windowMs);
    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil(result.resetTimeMs / 1000);
      res.status(429).json({
        success: false,
        message: `Too many verification attempts. Please wait ${retryAfterSeconds} seconds before trying again.`,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    next();
  };
}
