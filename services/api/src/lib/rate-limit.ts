import type { Request, Response, NextFunction } from "express";

type RateLimitRecord = {
  count: number;
  resetAtMs: number;
};

export type RateLimitMiddleware = ((req: Request, res: Response, next: NextFunction) => void) & {
  close: () => void;
};

export function createRateLimitMiddleware(input: {
  limit: number;
  windowMs: number;
  keyPrefix: string;
}): RateLimitMiddleware {
  const records = new Map<string, RateLimitRecord>();
  const sweepIntervalMs = Math.max(1000, Math.floor(input.windowMs / 2));
  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of records.entries()) {
      if (record.resetAtMs <= now) {
        records.delete(key);
      }
    }
  }, sweepIntervalMs);
  sweepTimer.unref?.();

  const middleware = ((req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const subjectId = req.body && typeof req.body.subjectId === "string" ? req.body.subjectId : "anonymous";
    const key = `${input.keyPrefix}:${ip}:${subjectId}`;
    const existing = records.get(key);

    if (!existing || now > existing.resetAtMs) {
      const resetAtMs = now + input.windowMs;
      records.set(key, { count: 1, resetAtMs });
      res.setHeader("x-ratelimit-limit", String(input.limit));
      res.setHeader("x-ratelimit-remaining", String(Math.max(0, input.limit - 1)));
      res.setHeader("x-ratelimit-reset", String(Math.ceil(resetAtMs / 1000)));
      next();
      return;
    }

    if (existing.count >= input.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000));
      res.setHeader("retry-after", String(retryAfterSeconds));
      res.status(429).json({
        error: "RATE_LIMITED",
        message: "Too many requests. Retry later."
      });
      return;
    }

    existing.count += 1;
    records.set(key, existing);
    res.setHeader("x-ratelimit-limit", String(input.limit));
    res.setHeader("x-ratelimit-remaining", String(Math.max(0, input.limit - existing.count)));
    res.setHeader("x-ratelimit-reset", String(Math.ceil(existing.resetAtMs / 1000)));
    next();
  }) as RateLimitMiddleware;

  middleware.close = () => {
    clearInterval(sweepTimer);
  };

  return middleware;
}
