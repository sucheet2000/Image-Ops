import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { assertInternalTokenSecret, internalTokenMiddleware } from '../src/internal-auth';

describe('internal mcp gateway auth', () => {
  it('requires gateway secret length of at least 32 bytes', () => {
    expect(() => assertInternalTokenSecret('short-secret')).toThrow(
      /MCP_GATEWAY_SECRET must be at least 32 bytes/i
    );
    expect(() => assertInternalTokenSecret('a'.repeat(32))).not.toThrow();
  });

  it('rejects requests without matching x-internal-token', () => {
    const middleware = internalTokenMiddleware('a'.repeat(32));
    const req = {
      header: vi.fn().mockReturnValue(undefined),
    } as unknown as Request;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'FORBIDDEN', message: 'Invalid internal token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts requests with matching x-internal-token', () => {
    const secret = 's'.repeat(32);
    const middleware = internalTokenMiddleware(secret);
    const req = {
      header: vi
        .fn()
        .mockImplementation((name: string) => (name === 'x-internal-token' ? secret : undefined)),
    } as unknown as Request;
    const status = vi.fn();
    const res = { status } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});
