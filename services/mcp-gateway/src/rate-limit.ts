import type { NextFunction, Response } from 'express';
import { config } from './config';
import type { AuthenticatedRequest } from './auth';

type RateState = {
  windowStart: number;
  count: number;
};

const stateByActor = new Map<string, RateState>();

function actorKey(req: AuthenticatedRequest): string {
  return req.auth?.sub || req.ip || 'anonymous';
}

export function rateLimitMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const key = actorKey(req);
  const now = Date.now();
  const current = stateByActor.get(key) || { windowStart: now, count: 0 };

  if (now - current.windowStart > config.rateLimitWindowMs) {
    current.windowStart = now;
    current.count = 0;
  }

  current.count += 1;
  stateByActor.set(key, current);

  if (current.count > config.rateLimitMaxRequests) {
    res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests.' });
    return;
  }

  next();
}
