import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const MIN_INTERNAL_SECRET_BYTES = 32;

function hasValidInternalToken(provided: string | undefined, expected: string): boolean {
  if (!provided) {
    return false;
  }

  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function assertInternalTokenSecret(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < MIN_INTERNAL_SECRET_BYTES) {
    throw new Error(
      `FATAL: MCP_GATEWAY_SECRET must be at least ${MIN_INTERNAL_SECRET_BYTES} bytes`
    );
  }
}

export function internalTokenMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.header('x-internal-token') || undefined;
    if (!hasValidInternalToken(token, secret)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid internal token' });
      return;
    }
    next();
  };
}
